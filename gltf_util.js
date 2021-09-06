import * as THREE from '../build/three.module.js';
import { dracoBuildings } from './examples/MyModels/hasDraco.js';
import { GLTFLoader } from './examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from './examples/jsm/loaders/DRACOLoader.js';
import { BufferGeometryUtils } from './examples/jsm/utils/BufferGeometryUtils.js';

//////////  Shader  ///////////////////////////////////////////////////////////
var _vertexShader = `
    varying vec2 vUv;
    void main()	{
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
var _fragmentShader = `
	//#extension GL_OES_standard_derivatives : enable

	varying vec2 vUv;
	uniform float thickness;

	// Compute anti-aliased world-space grid lines
	float edgeFactor(vec2 p){		
		vec2 grid = abs(fract(p - 0.5) - 0.5) / fwidth(p) / thickness;
		return min(grid.x, grid.y);
	}

	void main() {
			
		float line = edgeFactor(vUv);		
		vec3 c = mix(vec3(1), vec3(0), line);		
		gl_FragColor = vec4(c, 1.0);
	}
`;



// materials
const lineMaterial = new THREE.LineBasicMaterial( { color: 0x111111 } );
const whiteMaterial = new THREE.MeshBasicMaterial( { color: 0xffffff, side: THREE.DoubleSide } );
const invisibleMaterial = new THREE.MeshBasicMaterial( {	color: 0xffffff, transparent: true, opacity: 0 } );
const shaderMaterial = new THREE.ShaderMaterial( { vertexShader: _vertexShader, fragmentShader: _fragmentShader, transparent: false } );
const defaultMaterial = new THREE.MeshPhongMaterial( { color: 0xffffff, flatShading: true, vertexColors: true, shininess: 0	} );
const pickingMaterial = new THREE.MeshBasicMaterial( { vertexColors: true } );

// buildings and regions
const buildings = []; // list of building metadata
const region = {
    x_min: 9999999999.0, y_min: 9999999999.0, z_min: 9999999999.0,	//whole region
    x_max: - 9999999999.0, y_max: - 9999999999.0, z_max: - 9999999999.0
};
let tiles = [];	// divided regions
const buildingObjects = []; // list of THREE.Group
const sfactor = 0.7;	//scale factor of each building

class GltfUtil {
    constructor(scene, camera, controls) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
    }

    /////////////////////////////////////////////////////////////////////////////////////////
    // Load and Organize Building Information
    ////////////////////////////////////////////////////////////////////////////////////////
    loadBuildings() {

        // load building info (metadata)
        this.loadBuildingsFromCSV('./examples/MyModels/Converted_Location.csv');

        // loadBuildingsFromCSV() calls loadScene()

    }

    loadScene() {

        this.divideRegion(buildings, region); //region을 나누고, building마다 region 번호를 할당한다.
        //console.log( tiles );

        //// Draw Tiles (BoundingBox of each Region)
        for (let i = 0; i < tiles.length; i++) {

            //console.log( "building_num in tile " + i + ": " + tiles[ i ].buildings.length );
            this.drawRegions(tiles[i].buildings); // Draw all tile box

        }

        //fitCameraToObject( region ); // Fit to Overall Region

        //// Load Building Gltfs
        this.loadBuildingObjects(0); // loading 0-th tile

        this.fitCameraToObject(tiles[0]); // Fit to 0-th tile

        // // 모든 타일을 로딩 ? - 리소스 부족
        // let all_building_num = tiles[ 0 ].num_buildings;
        // for ( let i = 1; i < tiles.length; i ++ ) {

        // 	buildingObjects.push( null ); // Initialize buildingObject Array

        // 	loadBuildingObjects( tiles[ i ] );

        // 	all_building_num += tiles[ i ].num_buildings;
        // 	console.log( '** tile_id: ' + tiles[ i ].id + ', num_of_buildings: ' + tiles[ i ].num_buildings + ', All_building_num: ' + all_building_num );

        // }

    }

    loadBuildingObjects = async function (tile_index) {

        const i = tile_index;

        this.loadGltfs(tiles[i].buildings, i).catch(error => {

            console.error('Gltf Model Loading Error: ' + error);

        });

    }

    // 카메라와의 거리가 가까운 tile 찾고
    // 그 안의 buildings을 그린다
    updateBuildingObjects() {
        let camera = this.camera;
        const ON_LOADING = 777777;

        for (let i = 0; i < tiles.length; i++) {

            const tile_pos = new THREE.Vector3(tiles[i].position.x, tiles[i].position.y, tiles[i].position.z);

            // distance between camera <-> tiles
            const distance = camera.position.distanceTo(tile_pos);

            if (distance < 1000) {

                //console.log( 'tile_' + i + '(' + tiles[ i ].id + ')' + ' dist: ' + distance );

                if (!buildingObjects[i]) {	// 아직 로딩되지 않은 tiles... buildingObjects에 group을 저장하고 있다가 어떻게... 내보내기 할까? 

                    this.loadBuildingObjects(i);

                    buildingObjects[i] = ON_LOADING;

                }
                else if (buildingObjects[i] == ON_LOADING) { // 로딩 중

                    console.log('On going ... loading tile ' + i);

                }

                /*/
                // View Frustum 에서 완전히 벗어난 group을 dispose하고 remove from scene
                frustum.setFromProjectionMatrix( new THREE.Matrix4().multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ) );
                for ( let i = 4; i < scene.children.length; i ++ ) {
    
                    if ( scene.children[ i ] instanceof THREE.Group ) {
    
                        const group = scene.children[ i ];
    
                        group.visible = frustum.intersectsObject( group );	//error발생: group의 getBoundingSphere 구해야 함.
    
                        if ( ! group.visible ) {
    
                            group.traverse( function ( obj ) {
    
                                if ( obj.type === 'Mesh' ) { //dispose mesh
    
                                    obj.geometry.dispose();
                                    obj.material.dispose();
    
                                }
    
                            } );
                            // Delete the sub-object group of scene object scene
                            scene.remove( group );
    
                        }
    
                    }
    
                }//View Frustum Culling
                /*/


            } //if ( distance < 1000 )

        }

    }

    // Divide All Region to 100 X 100 Tiles
    divideRegion(blist, region) { //building list, //overall region

        //console.log( region );

        // Add Overall Region BoundingBox
        const group = new THREE.Group();
        const regionBox = new THREE.BoxGeometry(region.x_max - region.x_min, region.y_max - region.y_min, region.z_max - region.z_min);
        const regionMesh = new THREE.Mesh(regionBox, invisibleMaterial);
        regionMesh.position.set((region.x_min + region.x_max) / 2, (region.y_min + region.y_max) / 2, (region.z_min + region.z_max) / 2);
        group.add(regionMesh);
        group.add(new THREE.BoxHelper(group, 0xffff00));
        this.scene.add(group);

        // make tiles (subregions)
        const NUM_DIV_X = 200;//100; // X-axis divide
        const NUM_DIV_Y = 200;//100; // Y-axis divide

        const dist_X = region.x_max - region.x_min;	// Horizontal distance
        const dist_Y = region.y_max - region.y_min; // Vertical distance

        const length_X = dist_X / NUM_DIV_X;	// X length of a tile (a grid)
        const length_Y = dist_Y / NUM_DIV_Y;	// Y length of a tile (a grid)

        let index = 0;
        for (let i = 0; i < dist_X; i += length_X) {

            for (let j = 0; j < dist_Y; j += length_Y) {

                const tile = {
                    id: index,
                    num_buildings: 0, 	// Num of buildings
                    buildings: [],		// List of building id
                    x_min: i + region.x_min,	//region.x_min : offset
                    x_max: i + length_X + region.x_min,
                    y_min: j + region.y_min,
                    y_max: j + length_Y + region.y_min
                };

                tile.position = {
                    x: (tile.x_min + tile.x_max) / 2,
                    y: (tile.y_min + tile.y_max) / 2,
                    z: (region.z_min + region.z_max) / 2
                };

                tiles.push(tile);

                index += 1;

            }

        }

        // Allocate all buildings into tiles
        blist.forEach(function (building) {

            // Get Tile ID
            const col = parseInt((building.x_coord - region.x_min) / length_X);
            const row = parseInt((building.y_coord - region.y_min) / length_Y);
            building.region = row + col * NUM_DIV_Y;

            if (building.region >= tiles.length) { //경계에 걸쳐지는 빌딩

                //building.region = getTileId( building, tiles );
                building.region = row + (col - 1) * NUM_DIV_Y;

            }

            //building.region = getTileId( building, tiles ); // 일일이 비교 -시간 많이 걸림
            if (building.region >= 0) {

                tiles[building.region].buildings.push(building);
                tiles[building.region].num_buildings += 1;

            } else {

                console.log('Tile ID: ' + building.region);

            }

        });

        // Sorting tiles by num_buildings
        tiles.sort(function (a, b) {

            if (a.num_buildings < b.num_buildings) return 1;
            if (a.num_buildings > b.num_buildings) return - 1;
            if (a.num_buildings == b.num_buildings) return 0;

        });

        // Remove the tile which has no building
        tiles = tiles.filter(e => e.num_buildings > 0);

    }

    /*/
    function getTileId( building, tiles ) {
    
        // time-consumming
        for ( let i = 0; i < tiles.length; i ++ ) {
    
            if ( building.x_coord >= tiles[ i ].x_min && building.x_coord <= tiles[ i ].x_max
            && building.y_coord >= tiles[ i ].y_min && building.y_coord <= tiles[ i ].y_max )
                return i; // i == tiles[ i ].id
    
        }
    
        return - 1;
    
    }
    /*/

    drawRegions(blist) {

        const group = new THREE.Group();

        if (!blist) return;

        // get the tile of the building
        const building = blist[0];
        let tile;
        tiles.forEach(function (t) {

            if (building.region == t.id)
                tile = t;

        });

        // Add BoundingBox of the Tile
        let color = 0x00ffff;
        // if ( tile.num_buildings > 300 ) color = 0xff0000;
        // else if ( tile.num_buildings > 100 ) color = 0xff00ff;
        // else if ( tile.num_buildings > 50 ) color = 0x0000ff;
        if (tile.num_buildings > 100) color = 0xff0000;
        else if (tile.num_buildings > 50) color = 0xff00ff;
        else if (tile.num_buildings > 25) color = 0x0000ff;

        const regionBox = new THREE.BoxGeometry(tile.x_max - tile.x_min, tile.y_max - tile.y_min, region.z_max - region.z_min);
        const regionMesh = new THREE.Mesh(regionBox, invisibleMaterial);
        regionMesh.position.set((tile.x_min + tile.x_max) / 2, (tile.y_min + tile.y_max) / 2, (region.z_min + region.z_max) / 2);
        group.add(regionMesh);
        group.add(new THREE.BoxHelper(group, color));
        this.scene.add(group);

    }

    //////////////////////////////////////////////////////////////
    // Promise gltf model loader
    modelLoader(loader, url) {

        return new Promise((resolve, reject) => {

            loader.load(url, data => resolve(data), null, reject);

        });

        // return new Promise( resolve => {

        // 	new THREE.GLTFLoader().load( url, resolve );

        // } );

    }

    textureLoader(url) {

        return new Promise(resolve => {

            new THREE.TextureLoader().load(url, resolve);

        });

    }

    loadGltfs = async function (blist, tile_index) {
        let this_gltf = this;

        const group = new THREE.Group(); //mesh를 group으로 묶을 때 사용
        const geometries = [];

        //Gltf loader - gltf/glb/KHR_mesh_quantization support
        //const gltf_dir = './MyModels/gltf/';
        //const gltf_dir = './MyModels/glb/';
        //const loader = new GLTFLoader().setPath( gltf_dir );
        const loader = new GLTFLoader();

        // //Draco compressed gltf file Loading
        //const loader = new GLTFLoader().setPath( './MyModels/draco/' ); // Instantiate a gltf loader
        const dracoLoader = new DRACOLoader();	// a DRACOLoader instance to decode compressed mesh data
        dracoLoader.setDecoderPath('./examples/js/libs/draco/');
        loader.setDRACOLoader(dracoLoader);

        /////////////////////////////////////////////////////////////////////

        const promises = [];
        const models = [];

        //blist.forEach( function ( building ) {
        for (let i = 0; i < blist.length; i++) {

            const building = blist[i];

            const p = await this.modelLoader(loader, building.url).then(result => models.push(result.scene.children));
            promises.push[p];

            // if ( building.draco ) {

            // 	console.log( 'hasDraco :' + building );

            // }

        }

        //if all Promises resolved, do something to the models
        Promise.all(promises).then(() => {

            //console.log( `${building.name}` + ' : \n' + dumpObject( gltf.scene ).join( '\n' ) );

            for (let i = 0; i < blist.length; i++) {

                const building = blist[i];
                const model = models[i];

                //gltf.scene.children.forEach( function ( child ) {
                model.forEach(function (child) {

                    if (child.isMesh) {

                        const material = whiteMaterial;
                        const mesh = new THREE.Mesh(child.geometry, material);

                        //mesh.position.set( child.position.x, child.position.y, child.position.z );
                        //mesh.position.set( child.position.x, child.position.y, 0 );	//높이 값을 0으로 해볼까?
                        mesh.translateX(building.x_coord);
                        mesh.translateY(building.y_coord);
                        mesh.translateZ(building.altitude); //height: building.altitude

                        mesh.rotation.set(Math.PI / 2, 0, 0);	//rotate 90 degree

                        //mesh.scale.set( child.scale.x, child.scale.y, child.scale.z );	//overlap between buildings occur
                        //const sfactor = 0.7;	//scale factor
                        mesh.scale.set(child.scale.x * sfactor, child.scale.y * sfactor, child.scale.z * sfactor);
                        mesh.updateMatrixWorld();

                        //Add Mesh
                        const outline = this_gltf.createOutlineSegments(mesh.geometry);
                        mesh.wireframe = outline;
                        mesh.add(mesh.wireframe);

                        // Add gltf(mesh) to group
                        group.add(mesh);

                        // // Add geometry
                        // const geometry = mesh.geometry.toNonIndexed(); // Interleaved -> non indexed
                        // geometry.applyMatrix4( mesh.matrix );
                        // geometries.push( geometry );
                        // //group.add( geometry ); //BuffeGeometry는 Object3D가 아니라서, Group에 add할 수 없다.

                    } //if ( child.isMesh )

                }); //models.forEach

            } //for-blist

            // Draw BoXHelper
            group.add(new THREE.BoxHelper(group, 0x00ff00));

            // Add a group to Scene
            console.log(group);

            // Add group to buildingObjects array(list)
            buildingObjects[tile_index] = group.guid; //group

            this.scene.add(group); //

            //fitCameraToObject( tiles[ tile_index ] ); // Fit view to the tile

            /*/
            // Add Merged Geometry
            const merged_geom = BufferGeometryUtils.mergeBufferGeometries( geometries, false );
            merged_geom.computeVertexNormals();
            merged_geom.computeFaceNormals();
            buildingObjects[ tile_index ] = merged_geom;
    
            // Draw Buildings in Visible Tiles(SubRegions)
            const mesh = new THREE.Mesh( buildingObjects[ tile_index ], whiteMaterial );
            const outline = createOutlineSegments( mesh.geometry, 0xffffff );
            mesh.wireframe = outline;
            mesh.add( mesh.wireframe );
    
            scene.add( mesh );
            /*/

        }); //Promise.all

    }

    loadGltfGeometries(blist) {

        //const group = new THREE.Group();

        const geometriesDrawn = [];
        const geometriesPicking = [];

        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        const color = new THREE.Color();

        //Gltf loader - gltf/glb/KHR_mesh_quantization support
        //const gltf_dir = './MyModels/gltf/';
        //const loader = new GLTFLoader().setPath( gltf_dir );
        const loader = new GLTFLoader();

        //blist.forEach( function ( building ) {
        for (let i = 0; i < blist.length; i++) {

            const building = blist[i];

            loader.load(building.url, function (gltf) {

                //console.log( `${building.name}` + ' : \n' + dumpObject( gltf.scene ).join( '\n' ) );
                gltf.scene.updateMatrixWorld();
                gltf.scene.children.forEach(function (child) {

                    if (child.isMesh) {

                        let geometry = child.geometry;

                        const position = new THREE.Vector3();
                        position.x = building.x_coord;
                        position.y = building.y_coord;
                        position.z = building.altitude;

                        const rotation = new THREE.Euler();
                        rotation.x = Math.PI / 2;
                        rotation.y = 0;
                        rotation.z = 0;

                        const sfactor = 0.7;	//scale factor
                        const scale = new THREE.Vector3();
                        scale.x = child.scale.x * sfactor;
                        scale.y = child.scale.y * sfactor;
                        scale.z = child.scale.z * sfactor;

                        quaternion.setFromEuler(rotation);
                        matrix.compose(position, quaternion, scale);

                        // geometry.applyMatrix4( matrix );

                        /////////////////////////////////////////

                        const attributes = geometry.attributes;

                        if (!attributes.position || attributes.position.itemSize !== 3) {

                            return;

                        }

                        if (geometry.index) geometry = geometry.toNonIndexed();
                        geometry.applyMatrix4(child.parent.matrix);

                        ////////////////

                        // give the geometry's vertices a random color, to be displayed
                        applyVertexColors(geometry, color.setHex(Math.random() * 0xffffff));
                        geometriesDrawn.push(geometry);

                        geometry = geometry.clone();

                        // give the geometry's vertices a color corresponding to the "id"
                        applyVertexColors(geometry, color.setHex(0xff0000)); //setHex( i ) =? red color
                        geometriesPicking.push(geometry);

                        pickingData[i] = {

                            position: position,
                            rotation: rotation,
                            scale: scale

                        };

                    }

                });

                if (geometriesDrawn.length == blist.length) {

                    const geom = BufferGeometryUtils.mergeBufferGeometries(geometriesDrawn, false);
                    geom.computeVertexNormals();
                    geom.computeFaceNormals();
                    const mesh = new THREE.Mesh(geom, defaultMaterial);
                    scene.add(mesh);

                    pickingScene.add(new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(geometriesPicking), pickingMaterial));

                    //highlightBox = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshLambertMaterial( { color: 0xffff00 }	) );
                    scene.add(highlightBox);

                }

            }, undefined, function (error) {

                console.log('Loading error : ' + error);

            });

        }

    }

    ////////////////////////////////////////////////////////////////////

    // Location.csv로부터 건물 ID, 위치 정보 읽어 오기
    loadBuildingsFromCSV = async function (file_url) {

        //const gltf_dir = './MyModels/gltf/';
        const draco_dir = './examples/MyModels/draco/';
        const glb_dir = './examples/MyModels/glb/';

        const xhr = new XMLHttpRequest();
        xhr.open('GET', file_url, true);
        xhr.overrideMimeType('text/plain; charset=utf-8');

        let this_gltf = this

        xhr.onload = function () {

            const loc_file = new File([xhr.responseText], file_url, { type: 'text/plain', lastModified: new Date(0) });

            const reader = new FileReader();
            reader.onload = () => {

                const content = reader.result;
                content.split(/\r?\n/).forEach((line) => {

                    //line: buildingID,longitude,latitude,altitude,x_coord,y_coord
                    if (line.trim() === '') return buildings;		//마지막 라인(빈 줄)

                    const l = line.split(',');
                    const bID = l[0]; //l[0] is building ID

                    //if draco file exist, load (draco).gltf, else load .glb
                    let filename = bID + '.gltf';
                    let hasDraco = false;
                    if (this_gltf.checkHasDraco(bID)) {

                        filename = draco_dir + filename;
                        hasDraco = true;

                    } else
                        filename = glb_dir + bID + '.glb';

                    // } else if ( checkFileExist( glb_dir + bID + '.glb' ) )
                    // 	filename = glb_dir + bID + '.glb';
                    // else
                    // 	console.error( 'File Not Exist! :' + filename );

                    //Add building instance
                    const building = {
                        name: bID,
                        region: - 1,	// Region Number
                        longitude: parseFloat(l[1]),
                        latitude: parseFloat(l[2]),
                        altitude: parseFloat(l[3]),	//altitude == terrain_height?
                        x_coord: parseFloat(l[4]), //x-coord (EPSG:32652)
                        y_coord: parseFloat(l[5]), //y-coord (center point of the building ?)
                        url: filename, // dir + filename
                        draco: hasDraco
                    };
                    buildings.push(building);

                    // update region
                    region.x_min = (building.x_coord < region.x_min) ? building.x_coord : region.x_min;
                    region.y_min = (building.y_coord < region.y_min) ? building.y_coord : region.y_min;
                    region.z_min = (building.altitude < region.z_min) ? building.altitude : region.z_min;
                    region.x_max = (building.x_coord > region.x_max) ? building.x_coord : region.x_max;
                    region.y_max = (building.y_coord > region.y_max) ? building.y_coord : region.y_max;
                    region.z_max = (building.altitude > region.z_max) ? building.altitude : region.z_max;

                }); //building data acquisition from all lines of the input csv file

                //////////////////////////////////////////////////////////////////////////////////////////
                // load building gltfs and add to scene
                this_gltf.loadScene();

            }; //reader.onload

            reader.readAsText(loc_file);

        }; //xhr.onload

        xhr.send(null);

    }

    checkHasDraco(bID) { //building id에 해당하는 draco file이 있는지?

        if (parseInt(bID) < parseInt(dracoBuildings[0]) || parseInt(bID) > parseInt(dracoBuildings[dracoBuildings.length - 1]))
            return false;

        for (let i = 0; i < dracoBuildings.length; i++) {

            if (bID === dracoBuildings[i])
                return true;

        }

        return false;

    }

    checkFileExist(urlToFile) {

        const xhr = new XMLHttpRequest();
        xhr.open('HEAD', urlToFile, false);
        xhr.send();

        if (xhr.status == '404') {

            return false;

        } else {

            return true;

        }

    }

    /////////////////////////////////////////////////////////////////////////////////////////
    // Utilities... Fit Camera to Object, Pick, CreateOutline
    ////////////////////////////////////////////////////////////////////////////////////////
    fitCameraToObject(obj) { //fit camera to a region object
        let camera = this.camera;
        let controls = this.controls;
        //const box = new THREE.Box3().setFromObject( scene.children[ scene.children.length - 1 ] );
        //const box = new THREE.Box3().setFromObject( scene.children[ 3 ] ); //전체 지역 BoundingBox
        const box = new THREE.Box3(new THREE.Vector3(obj.x_min, obj.y_min, region.z_min),
            new THREE.Vector3(obj.x_max, obj.y_max, region.z_max));

        const boxSize = box.getSize(new THREE.Vector3());
        const boxCenter = box.getCenter(new THREE.Vector3());

        const halfSizeToFitOnScreen = boxSize.length() * 0.5;
        const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
        const distance = halfSizeToFitOnScreen / Math.tan(halfFovY);
        const direction = new THREE.Vector3()
            .subVectors(camera.position, boxCenter)
            //.multiply( new THREE.Vector3( 0, 1, 0 ) ) //Y값 (height) OR Z값?
            .multiply(new THREE.Vector3(0, 0, 1)) //Y값 (height) OR Z값?
            .normalize();

        camera.position.copy(direction.multiplyScalar(distance).add(boxCenter));

        // get the max side of the bounding box (fits to width OR height as needed )
        const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
        let cameraZ = Math.abs(maxDim);
        cameraZ *= 1.1; // 1.1; // zoom out a little so that objects don't fill the screen
        camera.position.z = cameraZ;

        const minZ = box.min.z;
        const cameraToFarEdge = (minZ < 0) ? - minZ + cameraZ : cameraZ - minZ;
        camera.far = cameraToFarEdge * 100;	// 4 ~ 100, 곱해주는 상수가 커질수록, view frustum 깊다.

        camera.updateProjectionMatrix();
        camera.lookAt(boxCenter.x, boxCenter.y, boxCenter.z);

        // set target to newest loaded model
        controls.target.copy(boxCenter);
        controls.update();

    }

    // Print Object (Gltf Scene)
    dumpObject(obj, lines = [], isLast = true, prefix = '') {

        const localPrefix = isLast ? '└─' : '├─';
        lines.push(`${prefix}${prefix ? localPrefix : ''}${obj.name || '*no-name*'} [${obj.type}]`);
        const newPrefix = prefix + (isLast ? '  ' : '│ ');
        const lastNdx = obj.children.length - 1;
        obj.children.forEach((child, ndx) => {

            const isLast = ndx === lastNdx;
            this.dumpObject(child, lines, isLast, newPrefix);

        });
        return lines;

    }

    // Outline by Shader
    createOutlineSegments(geometry) {

        const edge = new THREE.EdgesGeometry(geometry, 15); 	// thresholdAngle :default 1 degree
        const line = new THREE.LineSegments(edge, shaderMaterial);	//using shader - more pretty
        //const line = new THREE.LineSegments( edge, lineMaterial );	//basic line

        return line;

    }


    applyVertexColors(geometry, color) {

        const position = geometry.attributes.position;
        const colors = [];

        for (let i = 0; i < position.count; i++) {

            colors.push(color.r, color.g, color.b);

        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

}



export {
    GltfUtil
}
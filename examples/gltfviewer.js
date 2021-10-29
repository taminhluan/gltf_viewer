import * as THREE from '../build/three.module.js';

import { loadGltfs } from './LoadIncheonModels.js';

//////////////////////////////////////////////////////////////////////////////

// buildings and regions
let buildings = []; // list of building metadata
let region = {};
let quadTree = new Quadtree();
let treeObjects;

const raycaster = new THREE.Raycaster();
const sceneMeshes = new Array();
const buildingsGroup = new THREE.Group();

const invisibleMaterial = new THREE.MeshBasicMaterial( { color: 0xffffff, transparent: true, opacity: 0 } );
const blueMaterial = new THREE.MeshStandardMaterial( { color: 0x0011ff, side: THREE.DoubleSide } );
//const buildingGeometries = []; // list of building geometries

let deleteCandidates = [];

var camera, scene, renderer, controls;


class GltfViewer {
    constructor(_scene, _camera, _controls, bim3d, folder = 'reorder') {
        this.scene = _scene;
        this.camera = _camera;
        this.controls = _controls;
        this.folder = folder;
        scene = _scene;
        camera = _camera;
        controls = _controls;

        if (! bim3d) {
            bim3d = new THREE.Object3D();
        }
        this.bim3d = bim3d;
    }

    /////////////////////////////////////////////////////////////////////////////////////////
    // Load and Organize Building Information
    ////////////////////////////////////////////////////////////////////////////////////////
    // load building info (metadata)
    async loadBuildings(callback) {

        let self = this;
        //json 으로 저장된 Building Information 읽어오기
        this.readTextFile( `./MyModels/${this.folder}/buildings_info.json`, function ( text ) {

            [ region, buildings ] = JSON.parse( text );	//building info

            [ quadTree, treeObjects ] = self.makeQuadtree( buildings, region );

            self.loadScene();
            callback();
        } );

    }

    readTextFile( file, callback ) {

        var rawFile = new XMLHttpRequest();
        rawFile.overrideMimeType( 'application/json' );
        rawFile.open( 'GET', file, true );
        rawFile.onreadystatechange = function () {

            if ( rawFile.readyState === 4 && rawFile.status == '200' ) {

                callback( rawFile.responseText );

            }

        };

        rawFile.send( null );

    }

    makeQuadtree( buildings, region ) {

        const regionWidth = region.x_max - region.x_min;
        const regionHeight = region.y_max - region.y_min;

        const myTree = new Quadtree(
            {
                x: region.x_min,
                y: region.y_min,
                width: regionWidth,
                height: regionHeight
            },
            10, //max_objects
            10 //max_levels (max depth)
        );

        const myObjects = []; //building objects array

        for ( let i = 0; i < buildings.length; i ++ ) {

            const obj =
                {
                    index: i,	//index of geometry in buildings
                    name: buildings[ i ].name,
                    x: buildings[ i ].x_coord,
                    y: buildings[ i ].y_coord,
                    z: buildings[ i ].altitude,

                    width: 0.1,
                    height: 0.1,
                    check: false
                };

            //store object in our array
            myObjects.push( obj );

            //insert object in our quadtree
            myTree.insert( obj );

        }

        return [ myTree, myObjects ];

    }

    drawQuadtree( node, group ) {

        const bounds = node.bounds;

        //no subnodes? draw the current node
        if ( node.nodes.length === 0 ) {

            //draw node (bounds.x, bounds.y, bounds.width, bounds.height)
            //draw invisible mesh for raytracing
            // const box = new THREE.BoxGeometry( bounds.width, bounds.height, 10 ); //height = 10 으로 설정
            // const boxMesh = new THREE.Mesh( box, invisibleMaterial );
            // boxMesh.position.set( bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5, 0 );
            // group.add( boxMesh );

            //draw rectangle with lines
            const rect = [];
            rect.push( new THREE.Vector3( bounds.x, bounds.y, 0 ) );
            rect.push( new THREE.Vector3( bounds.x, bounds.y + bounds.height, 0 ) );
            rect.push( new THREE.Vector3( bounds.x + bounds.width, bounds.y + bounds.height, 0 ) );
            rect.push( new THREE.Vector3( bounds.x + bounds.width, bounds.y, 0 ) );
            rect.push( new THREE.Vector3( bounds.x, bounds.y, 0 ) );
            const geometry = new THREE.BufferGeometry().setFromPoints( rect );
            const material = new THREE.LineBasicMaterial( {	color: 0xff0000 } );
            const line = new THREE.Line( geometry, material );

            group.add( line );

        } else { //has subnodes? drawQuadtree them! (recursive)

            for ( var i = 0; i < node.nodes.length; i = i + 1 ) {

                this.drawQuadtree( node.nodes[ i ], group );

            }

        }

    }

    drawTreeObjects( myObjects, group ) {

        const vertices = [];
        const checked = [];

        for ( let i = 0; i < myObjects.length; i = i + 1 ) {

            const obj = myObjects[ i ];

            vertices.push( obj.x, obj.y, 10 );

            if ( obj.check ) {

                checked.push( obj.x, obj.y, obj.z );

            }

        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
        const material = new THREE.PointsMaterial( { color: 0x000000, transparent: true, opacity: 50 } );
        const points = new THREE.Points( geometry, material );

        group.add( points );

        const checkedGeometry = new THREE.BufferGeometry();
        checkedGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( checked, 3 ) );
        const checkedMaterial = new THREE.PointsMaterial( { color: 0x0000ff } );
        const checkedPoints = new THREE.Points( checkedGeometry, checkedMaterial );

        group.add( checkedPoints );

    }

    loadScene() {

        // create a plane mesh for the region
        const planeGeometry = new THREE.PlaneGeometry( ( region.x_max - region.x_min ), ( region.y_max - region.y_min ) );
        planeGeometry.computeBoundingBox();
        planeGeometry.computeBoundingSphere();
        const planeMesh = new THREE.Mesh( planeGeometry, invisibleMaterial );
        planeMesh.position.set( ( region.x_min + region.x_max ) * 0.5, ( region.y_min + region.y_max ) * 0.5, 0 );
        sceneMeshes.push( planeMesh ); //for raycasting (from camera to ground plane)
        // this.bim3d.add( planeMesh );

        // draw quadtree
        const treeGroup = new THREE.Group();
        treeGroup.name = 'quadtree-lines';
        this.drawQuadtree( quadTree, treeGroup );
        // this.bim3d.add( treeGroup );	

        // draw qtree objects
        const pointsGroup = new THREE.Group();
        pointsGroup.name = 'treeObjects-points';
        this.drawTreeObjects( treeObjects, pointsGroup );
        this.bim3d.add( pointsGroup );

        // group for building meshes
        buildingsGroup.name = 'buildings-meshes';
        this.bim3d.add( buildingsGroup );
        //enablePicking( buildingsGroup, canvas );

        this.fitCameraToObject( region ); // Fit to region

        ///////////////////////////////////////////////////////

        // initial position
        const centerX = region.x_min + ( region.x_max - region.x_min ) * 0.7;
        const centerY = region.y_min + ( region.y_max - region.y_min ) * 0.5;

        const cursor = { x: centerX, y: centerY, width: 500, height: 500 };
        const candidates = quadTree.retrieve( cursor );

        console.log( 'Candidate Objects: ' + candidates.length );

        //flag retrieved objects
        for ( let i = 0; i < candidates.length; i = i + 1 ) {

            candidates[ i ].check = true;

        }

        // load building meshes from gltfs
        this.loadBuildingObjects( candidates );

        // candidates의 region을 구한다.
        let xmin = 9999999; let ymin = 9999999;
        let xmax = - 9999999; let ymax = - 9999999;
        for ( let i = 0; i < candidates.length; i ++ ) {

            if ( candidates[ i ].x < xmin )	xmin = candidates[ i ].x;
            if ( candidates[ i ].x > xmax )	xmax = candidates[ i ].x;
            if ( candidates[ i ].y < ymin )	ymin = candidates[ i ].y;
            if ( candidates[ i ].y > ymax )	ymax = candidates[ i ].y;

        }

        const subregion = { x_min: xmin, x_max: xmax, y_min: ymin, y_max: ymax };
        this.fitCameraToObject( subregion ); // candidates의 region을 얻어와서 fit 해준다.

        ///////////////////////////////////////////////////////////////////////

    }

    loadBuildingObjects( objs ) {

        // Load 2D Vectors


        // Load 3D Meshs
        loadGltfs( objs, buildingsGroup, this.folder ).catch( error => {

            console.log( 'Gltf Model Loading Error: ' + error );

        } );

    }

    /////////////////////////////////////////////////////////////////////////////////////////
    // Fit Camera to Object
    ////////////////////////////////////////////////////////////////////////////////////////

    fitCameraToObject( obj ) { //fit camera to a region object

        //const box = new THREE.Box3().setFromObject( scene.children[ scene.children.length - 1 ] ); //맨 마지막 object
        //const box = new THREE.Box3().setFromObject( scene.children[ 3 ] );

        const box = new THREE.Box3( new THREE.Vector3( obj.x_min, obj.y_min, region.z_min ),
            new THREE.Vector3( obj.x_max, obj.y_max, region.z_max ) );

        const boxSize = box.getSize( new THREE.Vector3() );
        const boxCenter = box.getCenter( new THREE.Vector3() );

        const halfSizeToFitOnScreen = boxSize.length() * 0.5;
        const halfFovY = THREE.MathUtils.degToRad( camera.fov * 0.5 );
        const distance = halfSizeToFitOnScreen / Math.tan( halfFovY );
        const direction = new THREE.Vector3()
            .subVectors( camera.position, boxCenter )
            .multiply( new THREE.Vector3( 0, 1, 0 ) ) //(Up vector)  Y = height
            //.multiply( new THREE.Vector3( 0, 0, 1 ) ) // (Up vector) Z
            .normalize();

        camera.position.copy( direction.multiplyScalar( distance ).add( boxCenter ) );

        // get the max side of the bounding box (fits to width OR height as needed )
        const maxDim = Math.max( boxSize.x, boxSize.y, boxSize.z );
        let cameraZ = Math.abs( maxDim );
        cameraZ *= 1.1; // 0.9; // zoom in/out a little so that objects don't fill the screen
        camera.position.z = cameraZ;

        const minZ = box.min.z;
        const cameraToFarEdge = ( minZ < 0 ) ? - minZ + cameraZ : cameraZ - minZ;
        camera.far = cameraToFarEdge * 1000;	// 4 ~ 100, 곱해주는 상수가 커질수록, view frustum 깊다.

        camera.updateProjectionMatrix();
        camera.lookAt( boxCenter.x, boxCenter.y, boxCenter.z );

        // set target to newest loaded model
        controls.target.copy( boxCenter );
        controls.update();

    }

    arrayRemove( arr, value ) {

        return arr.filter( function ( ele ) {
    
            return ele != value;
    
        } );
    
    }
    
    updateBuildingObjects() {
    
        if ( ! treeObjects ) return;
        if ( sceneMeshes.length == 0 ) return;
    
        ///////////////////////////////////////////////////
        // sceneMeshes (ground plane mesh)와 camera 사이의 거리
    
        // camera와 화면의 center point와 intersection
        const bsphere = sceneMeshes[ 0 ].geometry.boundingSphere;
        raycaster.setFromCamera( bsphere.center, camera );
    
        //const scenePos = scene.position;
    
        const intersects = raycaster.intersectObjects( sceneMeshes, false );
    
        if ( intersects.length > 0 && intersects.distance < 5000 ) {
    
            const p = intersects[ 0 ].point;
    
            const cursor = { x: p.x, y: p.y, width: 500, height: 500 };
            const retrieved = quadTree.retrieve( cursor );
    
            const candidates = [];
    
            for ( let i = 0; i < retrieved.length; i = i + 1 ) {
    
                // 새롭게 추가 되는 객체만 로딩
                if ( ! retrieved[ i ].check ) {
    
                    retrieved[ i ].check = true;
                    candidates.push( retrieved[ i ] );
    
                    //if ( candidates.length >= 100 )
                    //	break;
    
                }
    
            }
    
        }
    
        /////////////////////////////////////////////
        // treeObjects와 camera 사이의 거리
    
        for ( let i = 0; i < treeObjects.length; i = i + 1 ) {
    
            const obj = treeObjects[ i ];
    
            const obj_pos = new THREE.Vector3( obj.x, obj.y, obj.z );
            const distance = camera.position.distanceTo( obj_pos );
    
            // frustum culling 계산에 시간이 너무 많이 걸림 - 대안을 생각해보자.
            // const frustum = new THREE.Frustum();
            // const v_camera = camera.clone();
            // v_camera.far = 50000;
            // frustum.setFromProjectionMatrix( new THREE.Matrix4().multiplyMatrices( v_camera.projectionMatrix, v_camera.matrixWorldInverse ) );
            // const visible = frustum.intersectsSphere( new THREE.Sphere( new THREE.Vector3( obj.x, obj.y, obj.z ), 50 ) );
    
            const visible = true; // 개선 필요...
    
            // mesh가 완전히 로딩된 상태
            if ( obj.check && obj.mesh ) {
    
                // clean up: reset treeObjects check flag, remove 3d objects
                // 만약 treeObjects[ i ].mesh와 camera 간의 거리가 threshold 이상이면 remove.
                if ( distance > 20000 || ! visible ) {
    
                    obj.check = false;
    
                    // scene에서 제거
                    buildingsGroup.remove( obj.mesh );
    
                    // 바로 메모리에서 지우지는 말고...
                    // deleteCandidates에 넣어 뒀다가, deleteCandidates의 크기가 threshold를 넘으면 지우자.
                    deleteCandidates.push( i );
    
                }
    
            //} else if ( obj.check && ! obj.mesh ) { // mesh가 로딩 중인 상태
    
                //console.log( 'On Loading Gltf ...' );
    
            } else if ( ! obj.check && obj.mesh ) { // mesh가 deleteCandidates 에 속한 상태, (obj.check == false)
    
                if ( distance < 10000 ) { 	// scene으로 복원
    
                    obj.check = true;
                    buildingsGroup.add( obj.mesh );
                    deleteCandidates = arrayRemove( deleteCandidates, i );
    
                }
    
            } else if ( ! obj.check && ! obj.mesh ) {	// 로딩 된 적이 없었거나, 완전히 지워진 obj
    
                // camera-obj distance가 가깝고, obj가 viewfrustum 안에 들어와 있을 경우에 로딩한다.
                if ( visible && distance < 2000 ) {
    
                    // extend to neighbor objs
                    const cursor = { x: obj.x, y: obj.y, width: 300, height: 300 };
                    const retrieved = quadTree.retrieve( cursor );
    
                    const candidates = [];
    
                    for ( let i = 0; i < retrieved.length; i = i + 1 ) {
    
                        // 새롭게 추가 되는 객체만 로딩
                        if ( ! retrieved[ i ].check ) {
    
                            retrieved[ i ].check = true;
                            candidates.push( retrieved[ i ] );
    
                        }
    
                    }
    
                    // load building meshes from gltfs
                    if ( candidates.length > 0 ) {
    
                        this.loadBuildingObjects( candidates );
    
                    }
    
                }
    
            }//end else-if
    
        }//end for (each elements of threeObjects)
    
        //////////////////////////////////////////////////
        // delete meshes
        if ( deleteCandidates.length > 10000 ) {
    
            // delete half elements of deleteCandidates
            for ( let i = 0; i < deleteCandidates.length * 0.5; i ++ ) {
    
                if ( treeObjects[ deleteCandidates[ i ] ].mesh ) {
                    // dispose mesh - remove 3d object
                    // deleteCandidates[ i ].geometry.dispose();
                    // deleteCandidates[ i ].material.dispose();
                    // deleteCandidates[ i ] = null;
                    treeObjects[ deleteCandidates[ i ] ].mesh.geometry.dispose();
                    treeObjects[ deleteCandidates[ i ] ].mesh.material.dispose();
                    treeObjects[ deleteCandidates[ i ] ].mesh = null;
                }
    
            }
    
            deleteCandidates.splice( 0, deleteCandidates.length * 0.5 );
    
        }
    
    }

    // double-click event: tweening to the mouse point & loadBuildingObjects
    onDoubleClick( event ) {

        const mouse = {
            x: ( event.clientX / renderer.domElement.clientWidth ) * 2 - 1,
            y: - ( event.clientY / renderer.domElement.clientHeight ) * 2 + 1
        };
        raycaster.setFromCamera( mouse, camera );

        if ( sceneMeshes.length > 0 ) {

            const intersects = raycaster.intersectObjects( sceneMeshes, false );
            if ( intersects.length > 0 ) {

                const p = intersects[ 0 ].point;	//intersect point btwn ground plane & camera-mouse vector
                new TWEEN.Tween( controls.target )
                    .to( {
                        x: p.x,
                        y: p.y,
                        z: p.z
                    }, 500 )
                    .easing( TWEEN.Easing.Cubic.Out )
                    .start();


                // load building meshes
                const cursor = { x: p.x, y: p.y, width: 500, height: 500 };
                const retrieved = quadTree.retrieve( cursor );
                const candidates = [];
                for ( let i = 0; i < retrieved.length; i = i + 1 ) {

                    // 새롭게 추가 되는 객체만 로딩
                    if ( ! retrieved[ i ].check ) {

                        retrieved[ i ].check = true;
                        candidates.push( retrieved[ i ] );

                    }

                }

                if ( candidates.length > 0 ) {
                    this.loadBuildingObjects( candidates );
                }

            }

        }

    }
        
//////////////////////////////////////////////////////////////////////////
}

export {
    GltfViewer
}
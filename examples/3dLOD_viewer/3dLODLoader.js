import * as THREE from '../../build/three.module.js';


//////////////////////////////////////////////////////////////////////////////
var VISIBLE_ITEM = 9
// buildings and regions
var quadTree = null;
var treeObjects;	//buildings are saved in treeObjects of Quadtree
var region = {
    height: 32698.1240000003,
    width: 38957.82030000002,
    x_max: 305188.9902,
    x_min: 266231.1699,
    y_max: 4168214.251,
    y_min: 4135516.127,
    z_max: 354.67566,
    z_min: 0
};


/////// Three.js Scene //////////////////////////////////////////////////////
var camera, scene, renderer, controls;




var raycaster = new THREE.Raycaster();
var sceneMeshes = new Array();	// the plane of ground

var treeNodeGroup = new THREE.Group(); // quadtree node mesh (plane)

var pointGroup = new THREE.Group(); // center points of each building
var floorGroup = new THREE.Group(); // 2d floor plan of building (line segments)
var surfaceGroup = new THREE.Group(); // 3d surface of building (by extruding from floor plan)
var lineGroup = new THREE.Group(); // outline of building (line segments)
var modelGroup = new THREE.Group(); // 3d building model group

var invisibleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
var whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffff95, side: THREE.DoubleSide });
var blueMaterial = new THREE.MeshBasicMaterial({ color: 0x0011ff, side: THREE.DoubleSide });
var greenMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff11, side: THREE.DoubleSide });
var redMaterial = new THREE.MeshStandardMaterial({ color: 0xff1100, side: THREE.DoubleSide });
var yellowMaterial = new THREE.MeshStandardMaterial({ color: 0xfff555, side: THREE.DoubleSide });
/////////////////////////////////////////////////////////////////

var need_update = false;
var onetime_timeout = undefined;

//
var requestUpdateBuilding;
var updateBuilding;
var AnimationLoop;
var render;
var loadBuildings;
var loadFloorTile;
var extrudeBuilding;
var readTextFile;
var fitCameraToObject;
var bim3d;
class ThreeDLODLoader {
    constructor(_scene, _camera, _controls, _bim3d, folder = 'reorder') {
        this.scene = _scene;
        this.camera = _camera;
        this.controls = _controls;
        this.folder = folder;
        scene = _scene;
        camera = _camera;
        controls = _controls;

        if (!_bim3d) {
            bim3d = new THREE.Object3D();
        } else {
            bim3d = _bim3d;
        }
        this.bim3d = bim3d;
        this.scene.add(bim3d);
        controls.addEventListener('change', () => {
            requestUpdateBuilding()
        });

        requestUpdateBuilding = this.requestUpdateBuilding;
        updateBuilding = this.updateBuilding;
        AnimationLoop = this.AnimationLoop;
        render = this.render;
        loadBuildings = this.loadBuildings;
        loadFloorTile = this.loadFloorTile;
        extrudeBuilding = this.extrudeBuilding;
        readTextFile = this.readTextFile;
        fitCameraToObject = this.fitCameraToObject;
    }

    requestUpdateBuilding() {
        clearTimeout(onetime_timeout)
        onetime_timeout = setTimeout(() => {
            need_update = true;
            updateBuilding()
        }, 300)

    }

    updateBuilding() {
        if (!need_update) {
            return;
        }
        need_update = false;
        console.log('update building', camera)
        {
            {
                camera.updateMatrix();
                camera.updateMatrixWorld();
                var frustum = new THREE.Frustum();
                frustum.setFromMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

                let needBreak = false;
                let tiles_inside_frustum = []
                let tiles_distances = []
                for (let i_x = 0; i_x < 39; i_x++) {
                    for (let i_y = 0; i_y < 33; i_y++) {
                        let real_x = region.x_min + i_x * 1000 + 500
                        let real_y = region.y_min + i_y * 1000 + 500

                        if (
                            frustum.containsPoint(new THREE.Vector3(real_x - 500, real_y - 500, 0)) ||
                            frustum.containsPoint(new THREE.Vector3(real_x - 500, real_y + 500, 0)) ||
                            frustum.containsPoint(new THREE.Vector3(real_x + 500, real_y - 500, 0)) ||
                            frustum.containsPoint(new THREE.Vector3(real_x + 500, real_y + 500, 0))
                        ) {
                            const dist = camera.position.distanceTo(new THREE.Vector3(real_x, real_y, 0));

                            tiles_inside_frustum.push(`${i_x}_${i_y}`)
                            tiles_distances.push(dist)
                        }
                    }
                }

                { // sort
                    for (let i = 0; i < tiles_distances.length; i++) {
                        for (let j = i + 1; j < tiles_distances.length; j++) {
                            if (tiles_distances[i] > tiles_distances[j]) {
                                let temp_distance = tiles_distances[i]
                                tiles_distances[i] = tiles_distances[j]
                                tiles_distances[j] = temp_distance

                                let temp_tile = tiles_inside_frustum[i]
                                tiles_inside_frustum[i] = tiles_inside_frustum[j]
                                tiles_inside_frustum[j] = temp_tile
                            }
                        }
                    }
                    console.log('tiles_distances', tiles_distances)
                }
                {// keep n nearest items
                    tiles_inside_frustum = tiles_inside_frustum.slice(0, VISIBLE_ITEM)
                }

                for (let i = 0; i < floorGroup.children.length; i++) {
                    let group = floorGroup.children[i]


                    let group_x = parseInt(group.name.split('_')[0])
                    let group_y = parseInt(group.name.split('_')[1])

                    let found_at = tiles_inside_frustum.indexOf(group.name)
                    if (found_at >= 0) {
                        tiles_inside_frustum.splice(found_at, 1)
                    } else {
                        floorGroup.remove(floorGroup.children[i])
                        console.log(`'remove' ${group_x}, ${group_y}`)
                    }
                }

                $("#panel").html('')
                for (let i_tile = 0; i_tile < tiles_inside_frustum.length; i_tile++) {
                    let xy = tiles_inside_frustum[i_tile]
                    let i_x = parseInt(xy.split('_')[0])
                    let i_y = parseInt(xy.split('_')[1])
                    loadFloorTile(i_x, i_y)
                }

            }
        }
    }

    

    /////////////////////////////////////////////////////////////////////////////////////////
    // Load and Organize Building Information
    ////////////////////////////////////////////////////////////////////////////////////////
    // load building info (metadata + 2d)
    loadBuildings() {
        readTextFile('./MyModels//3d_1216/points.bin', function (arrayBuffer) {
            {
                console.log(arrayBuffer)
                const vertices = [];
                console.log('byte length', arrayBuffer.byteLength);
                const dataView = new DataView(arrayBuffer)

                let item_length = 12;
                let n_items = arrayBuffer.byteLength / item_length;


                for (let i = 0; i < n_items; ++i) {

                    let x = dataView.getFloat32(i * item_length + 4 * 0, true)
                    let y = dataView.getFloat32(i * item_length + 4 * 1, true)
                    let altitude = dataView.getFloat32(i * item_length + 4 * 2, true)
                    vertices.push(x, y, 0);
                }

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                const material = new THREE.PointsMaterial({ color: 0x000000, opacity: 50 });
                const points = new THREE.Points(geometry, material);
                pointGroup.add(points);
            }
            bim3d.add(pointGroup)
            fitCameraToObject(region);

            console.log('load points')
            // loadScene();

        });

    }
    loadFloorTile(x, y) {
        console.log(`load tile ${x}, ${y}`)
        readTextFile(`./MyModels//3d_1216/footprints/footprints_${x}_${y}.bin`, function (arrayBuffer) {
            const group = new THREE.Group();
            group.name = `${x}_${y}`
            {
                const color = { color: 0xff0000 };
                //if ( building.points2d.length > 1 ) color = { color: 0xff0000 }; //multi-polygon 표시
                const material = new THREE.LineBasicMaterial(color);
                console.log(arrayBuffer)
                const vertices = [];
                let byteLength = arrayBuffer.byteLength
                console.log('byte length', arrayBuffer.byteLength);
                const dataView = new DataView(arrayBuffer)

                let item_length = 12;
                let position = 0;

                while (position < byteLength / 4) {
                    let n_xy = dataView.getInt32(position + 4 * 0, true)
                    let altitude = dataView.getFloat32(position + 4 * 1, true)
                    let bHeight = dataView.getFloat32(position + 4 * 2, true)
                    let points = []
                    for (let i = 0; i < n_xy / 2; i += 1) {
                        let x = dataView.getFloat32(position + 4 * 3 + 4 * (2 * i + 0), true)
                        let y = dataView.getFloat32(position + 4 * 3 + 4 * (2 * i + 1), true)
                        points.push(new THREE.Vector3(x, y, 0))
                    }
                    const geometry = new THREE.BufferGeometry().setFromPoints(points);
                    const plane = new THREE.Line(geometry, material);
                    // group.add(plane);

                    {
                        let surface, outline;
                        [surface, outline] = extrudeBuilding(points, bHeight, 0);
                        group.add(surface);
                        group.add(outline);
                    }

                    position += 4 * 3 + 4 * n_xy;
                }
            }

            floorGroup.add(group)
            bim3d.add(floorGroup)

            console.log(`load footprint done ${x}, ${y}`)
            // loadScene();

        });
    }


    //////////////////////////////////////////////////////////////////////////////
    extrudeBuilding(points, height, altitude) {

        const extrudeSettings = {
            depth: height,
            bevelEnabled: false
        };

        const shape = new THREE.Shape();
        for (let i = 0; i < points.length; i++) {

            if (i == 0) shape.moveTo(points[i].x, points[i].y);
            else shape.lineTo(points[i].x, points[i].y);

        }

        // 건물 높이에 따라 색깔 다르게
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        let material = whiteMaterial;
        if (height >= 100) material = blueMaterial;
        else if (height >= 20) material = greenMaterial;
        const mesh = new THREE.Mesh(geometry, material);

        mesh.translateZ(altitude);

        // create Outline
        const edges = new THREE.EdgesGeometry(geometry, 15);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));

        line.translateZ(altitude);

        return [mesh, line];

    }

    readTextFile(file, callback) {

        var xhr = new XMLHttpRequest();
        xhr.open('GET', file, true); //asynchronous: true, synchronous: false
        xhr.responseType = "arraybuffer";
        xhr.onload = function (oEvent) {
            var arrayBuffer = xhr.response; // Note: not xhr.responseText
            console.log(typeof arrayBuffer)
            callback(arrayBuffer)
        };
        xhr.send(null);

    }

    /////////////////////////////////////////////////////////////////////////////////////////
    // Fit Camera to Object
    ////////////////////////////////////////////////////////////////////////////////////////

    fitCameraToObject(obj) { //fit camera to a region object

        const box = new THREE.Box3(new THREE.Vector3(obj.x_min, obj.y_min, region.z_min),
            new THREE.Vector3(obj.x_max, obj.y_max, region.z_max));

        const boxSize = box.getSize(new THREE.Vector3());
        const boxCenter = box.getCenter(new THREE.Vector3());

        const halfSizeToFitOnScreen = boxSize.length() * 0.5;
        const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
        const distance = halfSizeToFitOnScreen / Math.tan(halfFovY);
        const direction = new THREE.Vector3()
            .subVectors(camera.position, boxCenter)
            //.multiply( new THREE.Vector3( 0, 1, 0 ) ) //(Up vector)  Y = height
            .multiply(new THREE.Vector3(0, 0, 1)) // (Up vector) Z
            .normalize();

        camera.position.copy(direction.multiplyScalar(distance).add(boxCenter));

        // get the max side of the bounding box (fits to width OR height as needed )
        const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
        let cameraZ = Math.abs(maxDim);
        cameraZ *= 1.1; // 0.9; // zoom in/out a little so that objects don't fill the screen
        camera.position.z = cameraZ;

        const minZ = box.min.z;
        const cameraToFarEdge = (minZ < 0) ? - minZ + cameraZ : cameraZ - minZ;
        camera.far = cameraToFarEdge * 1000;	// 4 ~ 100, 곱해주는 상수가 커질수록, view frustum 깊다.

        camera.updateProjectionMatrix();
        camera.lookAt(boxCenter.x, boxCenter.y, boxCenter.z);

        // set target to newest loaded model
        controls.target.copy(boxCenter);
        controls.update();

    }

}

export {
    ThreeDLODLoader
}
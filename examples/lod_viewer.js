import * as THREE from '../build/three.module.js';

/**
 * LOD Viewer
 * LOD level is like this: Points - Floor - Surface - Line - (3D)Model. 
 * 
 * Changelog:
 * Dr.Koo sent us this viewer 2021.12.01
 *
 * @usage: 
 *  let lodViewer = new LODViewer();
 *  lodViewer.loadBuildings();
 */

{ // copy global variable
    //////////////////////////////////////////////////////////////////////////////

    // buildings and regions
    let quadTree = null;
    let treeObjects;	//buildings are saved in treeObjects of Quadtree
    const region = {
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
    var container, stats;

    var canvas;

    const raycaster = new THREE.Raycaster();
    const sceneMeshes = new Array();	// the plane of ground

    const treeNodeGroup = new THREE.Group(); // quadtree node mesh (plane)

    const pointGroup = new THREE.Group(); // center points of each building
    const floorGroup = new THREE.Group(); // 2d floor plan of building (line segments)
    const surfaceGroup = new THREE.Group(); // 3d surface of building (by extruding from floor plan)
    const lineGroup = new THREE.Group(); // outline of building (line segments)
    const modelGroup = new THREE.Group(); // 3d building model group

    const invisibleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffff95, side: THREE.DoubleSide });
    const blueMaterial = new THREE.MeshStandardMaterial({ color: 0x0011ff, side: THREE.DoubleSide });
    const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff11, side: THREE.DoubleSide });
    const redMaterial = new THREE.MeshStandardMaterial({ color: 0xff1100, side: THREE.DoubleSide });
    const yellowMaterial = new THREE.MeshStandardMaterial({ color: 0xfff555, side: THREE.DoubleSide });
    /////////////////////////////////////////////////////////////////
}

{ // copy other global variable
    //-----------------------------------------------------------
    const DIST_POINTS = 15000; //(euclidian distance)
    const DIST_FLOOR = 8000;
    const DIST_SURFACE = 4000;
    const DIST_OUTLINE = 1500;

    //---------------------------------------------------------------------
    var loadedObjects = [];

    //---------------------------------------------------------------------
    const MAXNUM_OBJECTS = 50000;

    //----------------------------------------------------------
    const is3dPointsLoaded = [false, false, false, false, false];
    //const numBuildings = [ 29984, 29992, 29967, 39997, 20000, 29999, 30000, 29996, 21261, 17842, 16857 ];
    const idxBuildings = [0, 29984, 59976, 89943, 129940, 149940, 179939, 209939, 239935, 261196, 279038, 295895]; //누적

}

// for compatible with original code
//TODO: change to this.camera, this.scene, ...
var camera, scene, renderer, controls;
class LODViewer {
    constructor(_scene, _camera, _controls, bim3d, folder = 'reorder') {
        this.scene = _scene;
        this.camera = _camera;
        this.controls = _controls;
        this.folder = folder;
        scene = _scene;
        camera = _camera;
        controls = _controls;

        if (!bim3d) {
            bim3d = new THREE.Object3D();
        }
        this.bim3d = bim3d;
    }




    // Level of Detail - lookAt과 Camera 사이의 거리만으로
    setLOD(dist) {

        if (dist >= DIST_POINTS) {

            pointGroup.visible = true;

            floorGroup.visible = false;
            surfaceGroup.visible = false;
            lineGroup.visible = false;
            modelGroup.visible = false;

        } else if (dist >= DIST_FLOOR && dist < DIST_POINTS) {

            floorGroup.visible = true;

            pointGroup.visible = false;
            surfaceGroup.visible = false;
            lineGroup.visible = false;
            modelGroup.visible = false;

        } else if (dist >= DIST_SURFACE && dist < DIST_FLOOR) {

            surfaceGroup.visible = true;

            pointGroup.visible = false;
            floorGroup.visible = false;
            lineGroup.visible = false;
            modelGroup.visible = false;

        } else if (dist >= DIST_OUTLINE && dist < DIST_SURFACE) {

            surfaceGroup.visible = true;
            lineGroup.visible = true;

            pointGroup.visible = false;
            floorGroup.visible = false;
            modelGroup.visible = false;

        } else if (dist >= 0 && dist < DIST_OUTLINE) {

            modelGroup.visible = true;

            surfaceGroup.visible = false;
            lineGroup.visible = false;
            pointGroup.visible = false;
            floorGroup.visible = false;

        } else {

            console.log('Exceptional Case:  dist : ' + dist);

        }

    }

    //----------------------------------------------------------

    getVisibleNodes(node, visibleNodes, frustum) {

        if (node.nodes.length === 0) {

            const plane = node.mesh;

            plane.updateMatrix(); // make sure plane's local matrix is updated
            plane.updateMatrixWorld(); // make sure plane's world matrix is updated

            if (frustum.containsPoint(plane.position)
                && camera.position.distanceTo(plane.position) < region.height * 0.4) {

                visibleNodes.push(node);

            }

        } else { //has subnodes? (recursive)

            for (var i = 0; i < node.nodes.length; i = i + 1) {

                getVisibleNodes(node.nodes[i], visibleNodes, frustum);

            }

        }

    }



    updateBuildingObjects() {

        if (!treeObjects) return;
        if (sceneMeshes.length == 0) return;
        if (treeNodeGroup.children.length === 0) return;

        ///////////////////////////////////////////////////
        const p = controls.target; //lookAt

        // distance between camera and lookAt
        camera.updateProjectionMatrix();
        const dist = camera.position.distanceTo(p);

        // load 3d objects in view frustum
        const visibleNodes = [];

        // Set View Frustum
        const frustum = new THREE.Frustum();
        frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

        getVisibleNodes(quadTree, visibleNodes, frustum); //quad tree에서 화면에 보이는 nodes 얻어오기

        if (dist < DIST_FLOOR + 1000) {

            for (let i = 0; i < visibleNodes.length; i++) {

                if (visibleNodes[i].objects.length) {

                    loadBuildingObjects(visibleNodes[i].objects, loadedObjects);

                }

            }

        } else if (dist < DIST_SURFACE + 1000) {

            for (let i = 0; i < visibleNodes.length; i++) {

                if (visibleNodes[i].objects.length) {

                    loadBuildingObjects(visibleNodes[i].objects, loadedObjects);

                }

            }

        }


        setLOD(dist);


        /////////////////////////////////////////////////////////
        // 3d points를 나누어서 로딩
        if (dist > 40000)
            load3D(treeObjects, 0, 9, 9);
        else if (dist > 30000)
            load3D(treeObjects, 1, 10, 10);
        else if (dist > 25000)
            load3D(treeObjects, 2, 11, 11);
        else if (dist > 20000)
            load3D(treeObjects, 3, 5, 6);
        else if (dist > 15000)
            load3D(treeObjects, 4, 7, 8);
        else if (dist > 10000)
            load3D(treeObjects, 5, 1, 4);

        //visibleNodes 에 들어있는 buildings의 3d points 로딩하기
        //load3D( treeObjects, visibleNodes );

        /////////////////////////////////////////////////////////
        // delete 3d objects exceed MAXNUM_OBJECTS
        reduceLoadedObjects();

    }



    reduceLoadedObjects() {

        if (loadedObjects.length > MAXNUM_OBJECTS) {

            for (let i = 0; i < loadedObjects.length; i++) {

                const building = treeObjects[loadedObjects[i]]; // treeObjects에서의 index

                if (!building) {

                    console.log('Error: ' + building);
                    return;

                }


                const dist = camera.position.distanceTo({ x: building.x, y: building.y, z: building.bHeight });

                //거리가 먼 objects만 지우기
                if (dist > 10000 && building.check) {

                    building.check = false;

                    // dispose mesh - remove 3d object
                    if (building.surface) {

                        surfaceGroup.remove(building.surface);
                        building.surface.geometry.dispose();
                        building.surface.material.dispose();
                        building.surface = null;

                    }

                    if (building.outline) {

                        lineGroup.remove(building.outline);
                        building.outline.geometry.dispose();
                        building.outline.material.dispose();
                        building.outline = null;

                    }

                    if (building.model) {

                        modelGroup.remove(building.model);
                        building.model.geometry.dispose();
                        building.model.material.dispose();
                        building.model = null;

                    }

                    loadedObjects[i] = - 1;

                }

            }

            loadedObjects = loadedObjects.filter(ele => ele >= 0);

        }

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

    createBuildingModel(points3d) {

        const vertices = new Float32Array(points3d);

        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();

        geometry.computeBoundingSphere();
        let material = yellowMaterial;
        if (geometry.boundingSphere.radius > 20)
            material = redMaterial;

        const mesh = new THREE.Mesh(geometry, material);
        // create Outline
        const edges = new THREE.EdgesGeometry(geometry, 15);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
        mesh.wireframe = line;
        mesh.add(line);

        return mesh;

    }


    loadBuildingObjects(objs, loadedObjects) {

        objs.forEach(function (building) {

            // create 3d building object by extrusion
            if (!building.check) {

                if (!building.surface && !building.outline) {

                    if (building.bHeight != null) {	//height가 0 or null인 경우가 많다...

                        // extrusion
                        building.points2d.forEach(function (points) {

                            [building.surface, building.outline] = extrudeBuilding(points, building.bHeight, building.altitude);

                            surfaceGroup.add(building.surface);
                            lineGroup.add(building.outline);

                            building.check = true;

                            if (!loadedObjects.includes(building.idx)) {

                                loadedObjects.push(building.idx);

                            }

                        });

                    } else
                        console.log('building.bHeight is null.. id: ' + building.idx);

                }

            } else if (!building.model) {

                building.model = createBuildingModel(building.points3d);
                modelGroup.add(building.model);

            }

        });

    }

    /////////////////////////////////////////////////////////////////////////////////////////
    // Load and Organize Building Information
    ////////////////////////////////////////////////////////////////////////////////////////
    // load building info (metadata)
    loadBuildings() {

        readTextFile('./MyModels//lod_1201/buildings_2d.json', function (text) {

            // 2D floor plans of buildings
            const buildings = JSON.parse(text);
            text = null;	// 메모리 해제

            // make quadtree
            [quadTree, treeObjects] = makeQuadtree(buildings, region);

            loadScene();

        });

    }


    load3D(buildings, div, start, end) {

        if (is3dPointsLoaded[div]) return;

        is3dPointsLoaded[div] = true;

        // 11 개 파일 중 일부만 로딩
        for (let k = start; k <= end; k++) {

            const file_url = './MyModels/lod_1201/buildings_3d_' + k + '.json';

            let idx = idxBuildings[k - 1];

            readTextFileSync(file_url, function (text) { // Synchronous

                //readTextFile( file_url, function ( text ) { // ASynchronous

                // list of 3d points of buildings
                const blist = JSON.parse(text);
                text = null;

                for (let i = 0; i < blist.length; i++) {

                    if (buildings[idx + i].id == blist[i].id) {

                        buildings[idx + i].points3d = blist[i].pts;

                    } else
                        console.log('Error: building id is different....');

                }

                idx = idxBuildings[k];
                //idx = idx + blist.length;
                //console.log( k + ' num: ' + blist.length );

                console.log(k + ' th file for 3d points is loaded. ');

            });

        }

    }

    readTextFileSync(file, callback) {

        var xhr = new XMLHttpRequest();
        xhr.overrideMimeType('application/json');
        xhr.open('GET', file, false); // synchronous
        xhr.onreadystatechange = function () {

            if (xhr.readyState == 4 && xhr.status == 200) {

                callback(xhr.response);

            }

        };

        xhr.send(null);

    }

    readTextFile(file, callback) {

        var rawFile = new XMLHttpRequest();
        rawFile.overrideMimeType('application/json');
        rawFile.open('GET', file, true); //asynchronous: true, synchronous: false
        rawFile.onreadystatechange = function () {

            if (rawFile.readyState === 4 && rawFile.status == '200') {

                callback(rawFile.responseText);

            }

        };

        rawFile.send(null);

    }

    makeQuadtree(buildings, region) {

        const myTree = new Quadtree(
            {
                x: region.x_min,
                y: region.y_min,
                width: region.width,
                height: region.height
            },
            100, //max_objects
            8 	//max_levels (max depth)
        );

        const myObjects = []; //building objects array

        for (let i = 0; i < buildings.length; i++) {

            const building = buildings[i];

            // quadtree를 위한 properties
            building.idx = i;	//treeObjects[]에서의 index
            building.width = 1.0; //0.5, //작을 수록 depth가 깊어짐.
            building.height = 1.0; //0.5
            building.check = false;

            //store object in our array
            myObjects.push(building);

            //insert object in our quadtree
            myTree.insert(building);

        }

        return [myTree, myObjects];

    }

    drawQuadtree(node, group) {

        const bounds = node.bounds;

        //no subnodes? draw the current node
        if (node.nodes.length === 0) {

            //draw rectangle with lines
            const rect = [];
            rect.push(new THREE.Vector3(bounds.x, bounds.y, 0));
            rect.push(new THREE.Vector3(bounds.x, bounds.y + bounds.height, 0));
            rect.push(new THREE.Vector3(bounds.x + bounds.width, bounds.y + bounds.height, 0));
            rect.push(new THREE.Vector3(bounds.x + bounds.width, bounds.y, 0));
            rect.push(new THREE.Vector3(bounds.x, bounds.y, 0));
            const geometry = new THREE.BufferGeometry().setFromPoints(rect);
            const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
            const line = new THREE.Line(geometry, material);

            group.add(line);

        } else { //has subnodes? drawQuadtree them! (recursive)

            for (var i = 0; i < node.nodes.length; i = i + 1) {

                drawQuadtree(node.nodes[i], group);

            }

        }

    }

    makeTreeNodeMeshes(node, group) {

        const bounds = node.bounds;

        const vertices = [];
        vertices.push(bounds.x, bounds.y, 0);
        vertices.push(bounds.x, bounds.y + bounds.height, 0);
        vertices.push(bounds.x + bounds.width, bounds.y + bounds.height, 0);
        vertices.push(bounds.x + bounds.width, bounds.y, 0);
        vertices.push(bounds.x, bounds.y, 0);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const mesh = new THREE.Mesh(geometry, invisibleMaterial);
        mesh.position.set(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5, 0);
        node.mesh = mesh;

        group.add(node.mesh);


        if (node.nodes.length > 0) {

            for (var i = 0; i < node.nodes.length; i = i + 1) {

                makeTreeNodeMeshes(node.nodes[i], group);

            }

        }

    }

    createPointGroup(myObjects, group) { //As points

        const vertices = [];

        for (let i = 0; i < myObjects.length; i = i + 1) {

            const obj = myObjects[i];

            vertices.push(obj.x, obj.y, 0);

        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.PointsMaterial({ color: 0x000000, transparent: true, opacity: 50 });
        const points = new THREE.Points(geometry, material);

        group.add(points);

    }

    createFloorGroup(buildings, group) { //As line segments

        for (let i = 0; i < buildings.length; i = i + 1) {

            const building = buildings[i];	//building object

            const threePolygons = []; //convert to THREE polygons
            building.points2d.forEach(function (pts) {

                // 2d floor plan to polygon
                const polygon = [];
                for (let i = 0; i < pts.length; i++) {

                    polygon.push(new THREE.Vector3(pts[i][0], pts[i][1], building.altitude));

                }

                threePolygons.push(polygon);

            });

            building.points2d = threePolygons; //메모리 해제 ( polygon 만든 후에 다시 쓰이지 않음 )

            const color = { color: 0x000000 };
            //if ( building.points2d.length > 1 ) color = { color: 0xff0000 }; //multi-polygon 표시
            const material = new THREE.LineBasicMaterial(color);

            building.points2d.forEach(function (poly) {

                const geometry = new THREE.BufferGeometry().setFromPoints(poly);
                const plane = new THREE.Line(geometry, material);

                group.add(plane);

            });

        }

    }

    // Load Initial Scene
    loadScene() {

        // create a plane mesh for the region
        const planeGeometry = new THREE.PlaneGeometry(region.width, region.height);
        planeGeometry.computeBoundingBox();
        planeGeometry.computeBoundingSphere();
        const planeMesh = new THREE.Mesh(planeGeometry, invisibleMaterial);
        planeMesh.name = 'ground plane mesh';
        planeMesh.position.set((region.x_min + region.x_max) * 0.5, (region.y_min + region.y_max) * 0.5, 0);
        sceneMeshes.push(planeMesh); //for raycasting (from camera to ground plane)
        scene.add(planeMesh);

        fitCameraToObject(region); // Fit to region

        // // draw quadtree
        // const treeGroup = new THREE.Group();
        // treeGroup.name = 'quadtree-lines';
        // drawQuadtree( quadTree, treeGroup );
        // scene.add( treeGroup );

        // make tree node meshes (plane)
        treeNodeGroup.name = 'treeNode-plane meshes';
        makeTreeNodeMeshes(quadTree, treeNodeGroup);
        scene.add(treeNodeGroup);

        // draw qtree objects as point
        pointGroup.name = 'treeObjects-points';
        createPointGroup(treeObjects, pointGroup); //as point
        scene.add(pointGroup);

        // group for 2d floor plan as line segments
        floorGroup.name = '2d floor plans';
        createFloorGroup(treeObjects, floorGroup);
        scene.add(floorGroup);

        // group for extruded surfaces and lines
        surfaceGroup.name = '3d surfaces';
        lineGroup.name = '3d outlines';
        scene.add(surfaceGroup);
        scene.add(lineGroup);

        // group for (pre-designed) 3d meshes
        modelGroup.name = '3d meshes';
        scene.add(modelGroup);

        pointGroup.visible = true;
        floorGroup.visible = false;
        surfaceGroup.visible = false;
        lineGroup.visible = false;
        modelGroup.visible = false;

        //enablePicking( modelGroup, canvas );


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


    //////////////////////////////////////////////////////////////////////////


}
import * as THREE from '../build/three.module.js';

import { BufferGeometryUtils } from './jsm/utils/BufferGeometryUtils.js';

import { GLTFLoader } from './jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from './jsm/loaders/DRACOLoader.js';
//import { dracoBuildings } from './MyModels/hasDraco.js';


//Gltf loader - gltf/glb/KHR_mesh_quantization support
const loader = new GLTFLoader();
// //Draco compressed gltf file Loading
const dracoLoader = new DRACOLoader();	// a DRACOLoader instance to decode compressed mesh data
dracoLoader.setDecoderPath( 'js/libs/draco/' );
loader.setDRACOLoader( dracoLoader );

// building mesh file directory
const reorder_dir = './MyModels/reorder/'; //gltf-transform reorder glb
//const draco_dir = './MyModels/draco/';
//const glb_dir = './MyModels/glb/'; //gltfpack - glb

//////////  Shader  ///////////////////////////////////////////////////////////
var _vertexShader = `
    varying vec2 vUv;
    void main()	{
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
var _fragmentShader = `
	#extension GL_OES_standard_derivatives : enable

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
//const lineMaterial = new THREE.LineBasicMaterial( { color: 0x111111 } );
const whiteMaterial = new THREE.MeshStandardMaterial( { color: 0xffffff, side: THREE.DoubleSide } );
//const redMaterial = new THREE.MeshStandardMaterial( { color: 0xff1100, side: THREE.DoubleSide } );
//const yellowMaterial = new THREE.MeshStandardMaterial( { color: 0xff7700, side: THREE.DoubleSide } );
//const blueMaterial = new THREE.MeshStandardMaterial( { color: 0x0011ff, side: THREE.DoubleSide } );
//const greenMaterial = new THREE.MeshStandardMaterial( { color: 0x00ff11, side: THREE.DoubleSide } );
const shaderMaterial = new THREE.ShaderMaterial( { vertexShader: _vertexShader, fragmentShader: _fragmentShader, transparent: false } );
//const invisibleMaterial = new THREE.MeshBasicMaterial( { color: 0xffffff, transparent: true, opacity: 0 } );


/////////////////////////////////////////////////////////////////////////
// Functions
////////////////////////////////////////////////////////////////////////

function loadGltf( name, buildingGeometries, index ) {

	const url = reorder_dir + name + '.glb';

	buildingGeometries.push( null ); //initially put 'null'

	loader.load( url, function ( gltf ) {

		gltf.scene.traverse( function ( child ) {

			if ( child.isMesh ) {

				buildingGeometries[ index ] = child.geometry;	//loading success - put the geometry

			}

		} );

	}, undefined, function ( error ) {

		console.error( error );

	} );

}

// Promise gltf model loader
function modelLoader( url ) { //'loader'(GltfLoader) is globally defined

	return new Promise( ( resolve, reject ) => {

		loader.load( url, data=> resolve( data ), null, reject );

	} );

}

async function loadGltfs( blist, group ) { //building list(candidates), scene (to add meshes)

	const promises = [];
	const models = [];

	for ( let i = 0; i < blist.length; i ++ ) {

		const url = reorder_dir + blist[ i ].name + '.glb';

		const p = await modelLoader( url ).then( result => models.push( result.scene ) );
		promises.push[ p ];

	}

	//if all Promises resolved, do something to the models
	Promise.all( promises ).then( () => {

		for ( let i = 0; i < blist.length; i ++ ) {

			const building = blist[ i ];
			const model = models[ i ];

			const mesh = reduceGLTF( model ); // 여러 개의 children meshes를 하나로 merge

			// position translation - x,y,z 를 변형하면, 두 개 이상의 mesh로 구성되는 건물의 경우, 뒤틀림 (ex. 경기장)
			const transX = building.x;// - width_x * 0.5; 	//building.x_coord;	// blist가 buildings 를 reference 할 때
			const transY = building.y;// + width_y * 0.5; 	//building.y_coord;
			const transZ = building.z; 					//building.altitude;
			mesh.position.set( transX, transY, transZ );
			mesh.updateMatrixWorld();

/*/
			///////// LOD /////////////////////////////////

			const bbox = mesh.geometry.boundingBox;
			const width_x = bbox.max.x - bbox.min.x;
			const width_y = bbox.max.y - bbox.min.y;
			const width_z = bbox.max.z - bbox.min.z;

			// 건물의 Bounding Box로부터 BoxGeometry 만들기
			const box = new THREE.BoxGeometry( width_x, width_y, width_z );
			const boxMesh = new THREE.Mesh( box, yellowMaterial );
			boxMesh.position.set( transX, transY, transZ );

			//건물의 2D shape 정보 구하기
			const floor = getFloorprint( mesh.geometry );
			const floorMesh = new THREE.Mesh( floor, greenMaterial );
			floorMesh.position.set( transX, transY, transZ );

			const lod = new THREE.LOD();
			lod.addLevel( mesh, 100 ); 		//LOD_2
			lod.addLevel( boxMesh, 1000 ); 	//LOD_1
			lod.addLevel( floorMesh, 10000 ); 	//LOD_0
			lod.position.copy( mesh.position );
			lod.autoUpdate = true;

			//group.add( lod );

			/////////////////////////////////////////////////
/*/
			group.add( mesh );
			building.mesh = mesh;	// quadTree의 treeObjects에 mesh 저장

			//console.log( building.name + '.glb is loaded. ' + i + ' th.' );

		} //for-blist

		// group is already added to the scene.

	} ); //Promise.all


}

function reduceGLTF( obj3d ) {

	const geometries = [];

	obj3d.updateMatrixWorld();
	obj3d.traverse( ( node ) => {

		if ( ! node.isMesh ) {

			return;

		}

		let geometry = node.geometry;

		const attributes = geometry.attributes;

		if ( ! attributes.position || attributes.position.itemSize !== 3 ) {

			return;

		}

		if ( geometry.index )
			geometry = geometry.toNonIndexed(); // Interleaved -> non indexed

		geometries.push( geometry );

	} );

	// Merge geometries.
	let mesh;

	if ( geometries.length > 0 ) {

		const g = BufferGeometryUtils.mergeBufferGeometries( geometries, false );
		g.computeVertexNormals();
		g.computeFaceNormals();
		g.computeBoundingBox();
		g.computeBoundingSphere();


		const m = new THREE.Mesh( g, whiteMaterial );

		const outline = createOutlineSegments( g, 0xffffff );
		m.wireframe = outline;
		m.add( m.wireframe );

		mesh = m;

	}


	return mesh;

}
///////////////////////////////////////////////////////////////////////////////
// Utility Functions
//////////////////////////////////////////////////////////////////////////////

// Outline by Shader
function createOutlineSegments( geometry ) {

	const edge = new THREE.EdgesGeometry( geometry, 15 ); 	// thresholdAngle :default 1 degree
	const line = new THREE.LineSegments( edge, shaderMaterial );	//using shader - more pretty
	//const line = new THREE.LineSegments( edge, lineMaterial );	//basic line

	return line;

}

//Project to XY plane. 건물의 평면정보를 얻는다.
function getFloorprint( geometry ) {

	//create someplane to project to
	//const plane = new THREE.Plane().setFromCoplanarPoints(new THREE.Vector3(1,0,0), new THREE.Vector3(1,0,1), new THREE.Vector3(0,0,1)); //y==0
	const plane = new THREE.Plane().setFromCoplanarPoints( new THREE.Vector3( 1, 0, 0 ), new THREE.Vector3( 1, 1, 0 ), new THREE.Vector3( 0, 1, 0 ) ); //z==0

	const floorprint = geometry.clone();

	const positionAttr = floorprint.getAttribute( 'position' );
	for ( let i = 0; i < positionAttr.array.length; i += 3 ) {

		const point = new THREE.Vector3( positionAttr.array[ i ], positionAttr.array[ i + 1 ], positionAttr.array[ i + 2 ] );

		const projectedPoint = new THREE.Vector3();
		plane.projectPoint( point, projectedPoint );

		positionAttr.array[ i ] = projectedPoint.x;
		positionAttr.array[ i + 1 ] = projectedPoint.y;
		positionAttr.array[ i + 2 ] = projectedPoint.z;
		//positionAttr.array[i+2] = 0;

	}

	positionAttr.needsUpdate = true;

	const merged = BufferGeometryUtils.mergeVertices( floorprint, 0.1 );	// vertices merge //0.1 //default: 0.0001
	merged.deleteAttribute( 'normal' );

	return merged;

}


export { loadGltfs };

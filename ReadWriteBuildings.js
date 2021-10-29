const fs = require( 'fs' );
const path = require( 'path' );
//var Promise = require( 'bluebird' );
//var util = require( './utility' );

const Quadtree = require( '@timohausmann/quadtree-js' );

//const THREE = require('C:/Users/u/Documents/GitHub/THREE.js/build/three');
//require('C:/Users/u/Documents/GitHub/THREE.js/examples/jsm/loaders/GLTFLoader');
//const THREESTD = require('three-stdlib');
//var loader = require('./jsm/loaders/GLTFLoader.js');
//var threeLoader = require('./jsm/loaders');


/**
 * read building position data from csv file
 * @param {string} filePath
 * @param {array} buildings
 * @param {map} region
 * @returns {Array[object]} buildings
 */
function loadBuildingsFromCSV( file_url, buildings, region ) {

	const draco_dir = './MyModels/draco/';
	const glb_dir = './MyModels/glb/';

	try {

		const data = fs.readFileSync( file_url ); //path.join( filePath, fileName )
		var content = data.toString();

		content.split( /\r?\n/ ).forEach( function ( line ) {

			//line: buildingID,longitude,latitude,altitude,x_coord,y_coord
			if ( line.trim() === '' )
				return buildings;		//마지막 라인(빈 줄)

			const l = line.split( ',' );
			const bID = l[ 0 ]; //l[0] is building ID

			const filename = bID + '.glb';

			//Add building instance
			const building = {
				name: bID,
				//longitude: parseFloat( l[ 1 ] ),
				//latitude: parseFloat( l[ 2 ] ),
				altitude: parseFloat( l[ 3 ] ),	//altitude == terrain_height?
				x_coord: parseFloat( l[ 4 ] ), //x-coord (EPSG:32652)
				y_coord: parseFloat( l[ 5 ] ), //y-coord (center point of the building ?)
				//url: filename, // dir + filename
				//source: 'map' //'3ds', 'map', 'lidar'
			};

			// add to buildings list
			// delete 17459, 27178, 10447, 233839 in list
			if ( bID === '17459' || bID === '27178' || bID === '10447' || bID === '233839' )
				console.log( 'deleted:' + bID );
			else
				buildings.push( building );

			// update region
			region.x_min = ( building.x_coord < region.x_min ) ? building.x_coord : region.x_min;
			region.y_min = ( building.y_coord < region.y_min ) ? building.y_coord : region.y_min;
			region.z_min = ( building.altitude < region.z_min ) ? building.altitude : region.z_min;
			region.x_max = ( building.x_coord > region.x_max ) ? building.x_coord : region.x_max;
			region.y_max = ( building.y_coord > region.y_max ) ? building.y_coord : region.y_max;
			region.z_max = ( building.altitude > region.z_max ) ? building.altitude : region.z_max;

		} ); //building data acquisition from all lines of the input csv file

	} catch ( error ) {

		console.error( error );

	}

	return buildings;

}

/**
 * make quadtree from building location data
 * @param {Array[object]} buildings
 * @param {Map} region
 * @returns {Quadtree} buildingTree
 */
function makeQuadtree( buildings, region ) {

	const regionWidth = region.x_max - region.x_min;
	const regionHeight = region.y_max - region.y_min;

	const myTree = new Quadtree(
		{
			x: 0,
			y: 0,
			width: regionWidth,
			height: regionHeight
	    },
		10, //max_objects
		8 //max_levels (max depth)
	);

	const myObjects = []; //building objects array

	for ( let i = 0; i < buildings.length; i ++ ) {

		const obj =
            {
            	name: buildings[ i ].name,
            	x: ( buildings[ i ].x_coord - region.x_min ),
            	y: ( buildings[ i ].y_coord - region.y_min ),
            	width: 1,
            	height: 1,
            	check: false
            };

		//store object in our array
		myObjects.push( obj );

		//insert object in our quadtree
		myTree.insert( obj );

	}

	return [ myTree, myObjects ];

}
/*/ // 1000 X 1000 quad tree
function makeQuadtree( buildings, region ) {

    const NUM_DIV_X = 1000;
    const NUM_DIV_Y = 1000;
    const dist_X = region.x_max - region.x_min;
    const dist_Y = region.y_max - region.y_min;
    const length_X = dist_X / NUM_DIV_X; // X length of one cell
    const length_Y = dist_Y / NUM_DIV_Y; // Y length of one cell

    const myTree = new Quadtree(
        {
            x: 0,
            y: 0,
            width: 1000,
            height: 1000
	    },
        10, //max_objects
        8   //max_levels (max depth)
    );

    const myObjects = [];   //building objects array

    for (let i=0; i< buildings.length; i++) {

        const obj =
            {
                name: buildings[i].name,
                x : ( buildings[i].x_coord - region.x_min ) / length_X,
                y : ( buildings[i].y_coord - region.y_min ) / length_Y,
                width : 1,
                height : 1,
                check : false
            };

        //store object in our array
        myObjects.push(obj);

        //insert object in our quadtree
        myTree.insert(obj);

    }



    return [ myTree, myObjects ];

}
/*/

////////////////////////////////////////////////////////////////
// buildings and regions
const buildings = []; // list of building metadata
const region = { x_min: 9999999999.0, y_min: 9999999999.0, z_min: 9999999999.0,	//whole region
	x_max: - 9999999999.0, y_max: - 9999999999.0, z_max: - 9999999999.0 };

function main() {

	//const filepath = 'C:\Users\u\Documents\GitHub\THREE.js\examples\MyModels\Location.csv';
	loadBuildingsFromCSV( './examples/MyModels/location1029.csv', buildings, region );

	
    // Json 파일로 출력
	const info = [ region, buildings ];
	fs.writeFileSync( './examples/MyModels/gltf_1029/buildings_info.json', JSON.stringify( info ) );
/*/
    // Json 파일로부터 data 읽어오기
	const buffer = fs.readFileSync( './examples/MyModels/buildings_info.json' );
	const [ region2, buildings2 ] = JSON.parse( buffer.toString() );


	// Quadtree 만들고, 파일로 출력
	const qtree = makeQuadtree( buildings, region );
	fs.writeFileSync( './examples/MyModels/buildings_qtree.json', JSON.stringify( qtree ) );
/*/
}

main();

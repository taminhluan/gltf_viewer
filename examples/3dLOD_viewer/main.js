
import * as THREE from '../../build/three.module.js';
import { ThreeDLODLoader } from './3dLODLoader.js';
import { OrbitControls } from '../jsm/controls/OrbitControls.js';
import Stats from '../jsm/libs/stats.module.js';
import { TWEEN } from '../jsm/libs/tween.module.min.js';

var camera, scene, renderer, controls;
var container, stats;
var canvas;
init();


function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.0000001, 10000);
    camera.position.set(50, 100, 50);

    scene = new THREE.Scene();
    //scene.background = new THREE.Color( 0x111111 );
    scene.background = new THREE.Color(0xcccccc);

    //Lights
    const light1 = new THREE.DirectionalLight(0xffffff, 0.8);
    light1.position.set(1, 1, 1);
    scene.add(light1);
    const light2 = new THREE.DirectionalLight(0xffffff, 0.8);
    light2.position.set(1, 0.5, 1);
    scene.add(light2);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    let gl = renderer.getContext()
    gl.getExtension('EXT_frag_depth')

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    // renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // renderer.toneMappingExposure = 1;
    // renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.autoClear = true;
    renderer.clear();
    console.log('renderer', renderer)

    container.appendChild(renderer.domElement);

    canvas = renderer.domElement;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; //damping
    controls.dampingFactor = 0.5;//0.5; //damping inertia
    // How far you can dolly in and out ( PerspectiveCamera only )
    controls.minDistance = 1;
    controls.maxDistance = 100000;

    controls.minPolarAngle = - Math.PI; // radians
    controls.maxPolarAngle = Math.PI; // radians
    controls.minAzimuthAngle = - Math.PI / 24; // radians
    controls.maxAzimuthAngle = Math.PI / 24; // radians

    controls.rotateSpeed = 0.1;
    controls.keyPanSpeed = 50.0;

    controls.target.set(0.5, 0.5, - 0.5);

    
    controls.update();

    // Load Buildings //////////////////////////////////////////////

    let loader = new ThreeDLODLoader(scene, camera, controls, null, '3d_0120', 500)
    loader.loadBuildings();

    /////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////
    stats = new Stats();
    container.appendChild(stats.dom);

    /////////////////////////////////////////////////

    //Window resize support
    window.addEventListener('resize', onWindowResize, false);

    /////////////////////////////////////////////////////////////////////////

    renderer.domElement.addEventListener('dblclick', onDoubleClick, false);

    /////////////////////////////////////////////////////////////////

    AnimationLoop();

}





function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    render();

}



// double-click event: tweening to the mouse point & loadBuildingObjects
function onDoubleClick(event) {

    const mouse = {
        x: (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
        y: - (event.clientY / renderer.domElement.clientHeight) * 2 + 1
    };

    raycaster.setFromCamera(mouse, camera);

    if (sceneMeshes.length > 0) {

        const intersects = raycaster.intersectObjects(sceneMeshes, false);
        if (intersects.length > 0) {

            const p = intersects[0].point;	//intersect point btwn ground plane & camera-mouse vector
            new TWEEN.Tween(controls.target)
                .to({
                    x: p.x,
                    y: p.y,
                    z: p.z
                }, 500)
                .easing(TWEEN.Easing.Linear.None) //Quadratic.Out// Linear.None
                .start();

        }

    }

}
function AnimationLoop() {
    requestAnimationFrame(AnimationLoop);

    resizeRendererToDisplaySize(renderer);

    controls.update();

    TWEEN.update();
    //pick( camera );

    // updateBuilding();

    render();

    stats.update();

}


function render() {

    renderer.clear();
    renderer.setRenderTarget(null); //null : canvas is set as the active render target
    renderer.render(scene, camera);
}
//Auto-adjust camera to window size
function resizeRendererToDisplaySize(renderer) {

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {

        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

    }

}


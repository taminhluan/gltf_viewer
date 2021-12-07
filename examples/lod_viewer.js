import * as THREE from '../build/three.module.js';

/**
 * LOD Viewer
 * LOD level is like this: Points - Floor - Surface - Line - (3D)Model. 
 * 
 * Changelog:
 * Dr.Koo sent us this viewer 2021.12.01
 */
class LodViewer {
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

}
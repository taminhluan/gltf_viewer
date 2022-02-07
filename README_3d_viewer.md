# 3D Viewer

Visualize 3D building by grid. Source code in folder /examples/3dLOD_viewer

- 3dLODLoader.js: a loader
- main.js : a demo program

### How to use 3dLODLoader

```javascript
    # constructor
    class ThreeDLODLoader {
        constructor(_scene, _camera, _controls, _bim3d, _folder = 'reorder', _grid_resolution = 1000) { }

    # usages:
    let loader = new ThreeDLODLoader(scene, camera, controls, null, '3d_0120', 500)
    loader.loadBuildings();
```

### How 3dLODLoader works

```javascript
    // updateBuildings procedure:
        // get all tiles inside frustum
        // sort by distance
        // keep n nearest items
        // remove unused floor and model
        // Load floor tiles inside frustum
        // Load model tiles inside frustum
```
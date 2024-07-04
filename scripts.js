let scene, camera, renderer, pen;
let isExporting = false;
let capturer;
let isRotating = false;
let isTextured = false;
let directionalLight, ambientLight;
let rotationStartPoint = 0;
let currentRotation = 0;

function loadCCaptureScript(callback) {
    if (typeof CCapture === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/CCapture.js/1.1.0/CCapture.all.min.js';
        script.onload = callback;
        script.onerror = function() {
            console.error('Failed to load CCapture script.');
        };
        document.head.appendChild(script);
    } else {
        callback();
    }
}

function init() {
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-20, 20, 35.6, -35.6, 1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(450, 800);
    renderer.setClearColor(0x808080);  // Solid gray background
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const points = [];
    const topRadius = 5; // 10mm diameter
    const bottomRadius = 4; // 8mm diameter
    const totalHeight = 58.6;
    const straightHeight = 35;
    const curveHeight = totalHeight - straightHeight;

    // Top circle
    for (let i = 0; i <= 20; i++) {
        points.push(new THREE.Vector2(Math.cos(i * 0.1 * Math.PI) * topRadius, totalHeight));
    }
    
    // Straight section
    points.push(new THREE.Vector2(topRadius, totalHeight));
    points.push(new THREE.Vector2(topRadius, curveHeight));
    
    // Curved section
    for (let i = 1; i <= 20; i++) {
        const t = i / 20;
        const radius = topRadius + (bottomRadius - topRadius) * t;
        const y = curveHeight * (1 - t);
        points.push(new THREE.Vector2(radius, y));
    }
    
    // Bottom circle
    for (let i = 20; i >= 0; i--) {
        points.push(new THREE.Vector2(Math.cos(i * 0.1 * Math.PI) * bottomRadius, 0));
    }

    const geometry = new THREE.LatheGeometry(points, 64);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc,
        metalness: 0.2,
        roughness: 0.1
    });
    pen = new THREE.Mesh(geometry, material);
    scene.add(pen);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);  // Top right lighting
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-1, -1, 1);  // Bottom left fill light
    scene.add(fillLight);

    camera.position.set(0, 29.3, 100);
    camera.lookAt(0, 29.3, 0);

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (isRotating) {
        if (pen) {
            pen.rotation.y += 0.01;
            currentRotation = pen.rotation.y;
        }
    }
    renderer.render(scene, camera);

    if (isExporting) {
        capturer.capture(renderer.domElement);
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (fileExtension === 'svg' || fileExtension === 'ai') {
            handleVectorImage(e.target.result);
        } else {
            handleRasterImage(e.target.result);
        }
    }

    reader.readAsDataURL(file);
}

function handleVectorImage(data) {
    // Create a temporary SVG element
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempSvg.innerHTML = data;
    document.body.appendChild(tempSvg);

    // Render SVG to canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const svgData = new XMLSerializer().serializeToString(tempSvg);
    const img = new Image();
    img.onload = function() {
        ctx.drawImage(img, 0, 0, 1024, 1024);
        document.body.removeChild(tempSvg);
        applyDecal(canvas.toDataURL());
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
}

function handleRasterImage(data) {
    applyDecal(data);
}

function applyDecal(imageData) {
    const texture = new THREE.TextureLoader().load(imageData, function(tex) {
        tex.encoding = THREE.sRGBEncoding;
        if (pen.material.map) {
            pen.material.map.dispose();
        }

        pen.material.map = tex;
        pen.material.needsUpdate = true;

        const geometry = pen.geometry;
        const uv = geometry.attributes.uv;
        const position = geometry.attributes.position;

        for (let i = 0; i < uv.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);

            const angle = Math.atan2(x, z);
            const u = (angle + Math.PI) / (2 * Math.PI);
            const v = y / 58.6;

            // Adjust U to account for changing diameter
            const height = 58.6;
            const topDiameter = 10;
            const bottomDiameter = 8;
            const straightSectionHeight = 35;

            let diameter = topDiameter;
            if (y < height - straightSectionHeight) {
                diameter = topDiameter - (topDiameter - bottomDiameter) * ((height - y) / (height - straightSectionHeight));
            }

            const adjustedU = (u * (diameter / topDiameter)) % 1.0;
            uv.setXY(i, adjustedU, v);
        }

        uv.needsUpdate = true;

        // Set the rotation start point to center of the image
        rotationStartPoint = Math.PI;
        pen.rotation.y = rotationStartPoint;
    });
}

function clearDecal() {
    if (pen.material.map) {
        pen.material.map.dispose();
        pen.material.map = null;
        pen.material.needsUpdate = true;
    }
    rotationStartPoint = 0;
    pen.rotation.y = rotationStartPoint;
}

function exportWEBM() {
    loadCCaptureScript(function() {
        capturer = new CCapture({
            format: 'webm',
            framerate: 60,
            verbose: true,
            name: 'pengems_design',
            quality: 100
        });

        isRotating = true;
        isExporting = true;
        capturer.start();

        setTimeout(() => {
            isRotating = false;
            isExporting = false;
            capturer.stop();
            capturer.save((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'pengems_design.webm';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        }, 5000);  // Export 5 seconds of animation
    });
}

function exportPNG() {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
        saveAs(blob, 'pengems_design.png');
    }, 'image/png');
}

function exportJPG() {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
        saveAs(blob, 'pengems_design.jpg');
    }, 'image/jpeg');
}

function exportSTL() {
    const exporter = new THREE.STLExporter();
    const stlString = exporter.parse(scene);
    const blob = new Blob([stlString], {type: 'text/plain'});
    saveAs(blob, 'pengems_design.stl');
}

function toggleRotation() {
    isRotating = !isRotating;
    const rotateBtn = document.getElementById('rotate-btn');
    if (isRotating) {
        rotateBtn.textContent = 'Stop Rotation';
        rotateBtn.classList.add('active');
    } else {
        rotateBtn.textContent = 'Start Rotation';
        rotateBtn.classList.remove('active');
        pen.rotation.y = currentRotation;
    }
}

function toggleTexture() {
    isTextured = !isTextured;
    const textureBtn = document.getElementById('texture-btn');
    if (isTextured) {
        textureBtn.textContent = 'Remove Texture';
        textureBtn.classList.add('active');
        if (pen.material.map) {
            pen.material.bumpMap = pen.material.map;
            pen.material.bumpScale = 0.1;
            pen.material.needsUpdate = true;
        }
    } else {
        textureBtn.textContent = 'Add Texture';
        textureBtn.classList.remove('active');
        pen.material.bumpMap = null;
        pen.material.bumpScale = 0;
        pen.material.needsUpdate = true;
    }
}

function adjustBrightness(event) {
    const brightness = parseFloat(event.target.value);
    directionalLight.intensity = brightness;
    ambientLight.intensity = brightness * 0.6;
}

init();

document.getElementById('file-input').addEventListener('change', handleFileUpload);
document.getElementById('clear-btn').addEventListener('click', clearDecal);
document.getElementById('export-mp4-btn').addEventListener('click', exportWEBM);
document.getElementById('export-png-btn').addEventListener('click', exportPNG);
document.getElementById('export-jpg-btn').addEventListener('click', exportJPG);
document.getElementById('export-stl-btn').addEventListener('click', exportSTL);
document.getElementById('rotate-btn').addEventListener('click', toggleRotation);
document.getElementById('texture-btn').addEventListener('click', toggleTexture);
document.getElementById('brightness-slider').addEventListener('input', adjustBrightness);

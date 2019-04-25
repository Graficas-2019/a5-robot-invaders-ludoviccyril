async function setup(canvas) {
  // setup renderer
  let renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.width, canvas.height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // set up camera
  let camera = new THREE.PerspectiveCamera(
    45,
    canvas.width / canvas.height,
    1,
    4000
  );
  camera.position.set(-100, 3, 0);
  camera.lookAt(100, 0, 0);

  // set up raycaster
  let raycaster = new THREE.Raycaster();

  // set up scene
  let scene = new THREE.Scene();
  scene.add(camera);

  // set up lights
  let mainLight = new THREE.PointLight(0xffffff, 1, 0, 5);
  mainLight.position.set(-150, 50, 0);
  mainLight.castShadow = true;
  scene.add(mainLight);

  let ambientLight = new THREE.AmbientLight(0x404040, 0.5);
  scene.add(ambientLight);

  // set up plane
  let planeTexture = new THREE.TextureLoader().load('./assets/plane.gif');
  planeTexture.wrapS = THREE.RepeatWrapping;
  planeTexture.wrapT = THREE.RepeatWrapping;
  planeTexture.repeat.set(8, 8);

  let plane = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200, 50, 50),
    new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: planeTexture,
      side: THREE.DoubleSide
    })
  );
  plane.position.set(0, 0, 0);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);

  // set up mixer
  let mixer = new THREE.AnimationMixer(scene);

  // set up object groups
  let robots = new THREE.Object3D();
  scene.add(robots);

  let robotLoader = new THREE.FBXLoader();
  let robotModel = await new Promise(resolve => {
    robotLoader.load('./assets/robot_atk.fbx', object => {
      resolve(object);
    });
  });
  let runningRobotModel = await new Promise(resolve => {
    robotLoader.load('./assets/robot_run.fbx', object => {
      resolve(object);
    });
  });

  let kf1 = new THREE.Quaternion();
  let kf2 = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -Math.PI / 2
  );
  let deadAnimation = new THREE.AnimationClip('die', 4, [
    new THREE.QuaternionKeyframeTrack(
      'Bip01_Spine.quaternion',
      [0, 1],
      [kf1.x, kf1.y, kf1.z, kf1.w, kf2.x, kf2.y, kf2.z, kf2.w]
    )
  ]);

  let animations = [
    robotModel.animations[0],
    runningRobotModel.animations[0],
    deadAnimation
  ];
  delete robotModel.animations;
  robots.update = updateRobots.bind(robots, robotModel, mixer, animations);

  return { renderer, scene, camera, mixer, raycaster, robots };
}

function updateRobots(robotModel, mixer, animations) {
  for (let robot of this.children) {
    if (robot.died && Date.now() > robot.died + 3500) {
      robot.action.stop();
      this.remove(robot);
    }
  }
  while (this.children.length < 10) {
    let newRobot = cloneFbx(robotModel);

    let z = Math.random() * 200 - 100;
    newRobot.position.set(95, 0, z);
    newRobot.rotation.set(0, Math.atan2(195, z) + Math.PI, 0);
    newRobot.scale.set(0.005, 0.005, 0.005);

    newRobot.nextAction = 'run';
    newRobot.currentAction = null;
    newRobot.index = this.children.length;
    newRobot.update = updateRobot.bind(newRobot, mixer, animations);

    this.add(newRobot);
  }
}

function updateRobot(mixer, animations, round) {
  if (!this.died) {
    let remainingDistance = Math.sqrt(
      Math.pow(-100 - this.position.x, 2) + Math.pow(-this.position.z, 2)
    );
    if (remainingDistance > 10) {
      this.position.set(
        this.position.x + ((-100 - this.position.x) * 0.2) / remainingDistance,
        0,
        this.position.z + (-this.position.z * 0.2) / remainingDistance
      );
    } else {
      this.nextAction = 'attack';
      round.score -= 0.05;
    }
  }
  manageActions(this, mixer, animations);
}

function manageActions(robot, mixer, animations) {
  if (robot.nextAction !== robot.currentAction) {
    if (robot.action) {
      robot.action.stop();
    }
    let animation;
    if (robot.nextAction === 'run') {
      animation = animations[1];
    } else if (robot.nextAction === 'die') {
      animation = animations[2];
    } else {
      animation = animations[0];
    }
    robot.action = mixer.clipAction(animation, robot);
    if (robot.nextAction === 'die') {
      robot.action.loop = THREE.LoopOnce;
    }
    robot.action.play();
    robot.currentAction = robot.nextAction;
  }
}

function click(elements, round, event) {
  event.preventDefault();
  let position = new THREE.Vector2();
  position.x = (event.clientX / window.innerWidth) * 2 - 1;
  position.y = -(event.clientY / window.innerHeight) * 2 + 1;

  elements.raycaster.setFromCamera(position, elements.camera);

  let intersects = elements.raycaster.intersectObjects(
    elements.robots.children,
    true
  );

  if (intersects.length > 0) {
    let robot = intersects[0].object.parent;
    if (!robot.died) {
      robot.nextAction = 'die';
      robot.died = Date.now();
      round.score += 10;
    }
  }
}

function run(game, round, elements, prevTime) {
  let time = Date.now();
  let timeLeft = 60000 - time + round.start;
  let delta = time - prevTime;

  $('.time-value').text(`${Math.round(timeLeft / 1000)} segundos`);
  $('.score-value').text(Math.round(round.score));

  requestAnimationFrame(function() {
    if (timeLeft > 0) {
      run(game, round, elements, time);
    } else {
      let highScore = Math.round(
        Math.max(
          ...game.map(el => {
            return el.score;
          })
        )
      );
      $('.info').hide();
      $('.restart').css('display', 'flex');
      $('.high-score-value').text(highScore);
    }
  });

  elements.scene.traverse(child => {
    if (child.update) {
      child.update(round);
    }
  });

  elements.mixer.update(delta * 0.001);

  elements.renderer.render(elements.scene, elements.camera);
}

$(document).ready(() => {
  let canvas = document.getElementById('robots');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  let game = [];

  $('button').click(async () => {
    $('.start').hide();
    $('.restart').hide();
    $('.info').show();

    let round = {
      score: 0,
      start: Date.now()
    };
    game.push(round);

    let elements = await setup(canvas);
    document.addEventListener('mousedown', click.bind(null, elements, round));
    run(game, round, elements, Date.now());
  });
});

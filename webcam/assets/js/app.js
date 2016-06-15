var WEBCAM;
(function (WEBCAM) {

	WEBCAM.info = {
		ver    : '0.4.3',
		update : '2016-06-15',
		url    : 'https://rbv912.github.io/webcam/',
		author : 'Nobuaki Honma'
	}

	var WebCam = (function () {

		var s = WebCam,
		    p = WebCam.prototype;

		function WebCam() {
			this._init();
			this._hasGetUserMedia();
			this._getUserMedia();
		}

		/*** 初期化 ***/
		p._init = function () {
			// Video 要素を取得
			this.video = document.getElementById('js-video');
			this.video.autoplay = true;
			this.localMediaStream = null;

			// 動画とオーディオの設定
			this.option = {
				video: {
					width: 1280,
					height: 720,
					mandatory: { 'minWidth': 1280 }
				},
				audio: true
			}
		};

		/*** WebCam が使用できるかチェック ***/
		p._hasGetUserMedia = function () {
			// API が使えるかのチェック
			var hasGetUserMedia = function() {
				return (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
			}
			// API がサポートされていない時の処理
			if ( !hasGetUserMedia() ) {
				console.log('UserMedia not supported');
			}
		};

		/*** WebCam のストリーミングを取得 ***/
		p._getUserMedia = function () {
			var _this = this;

			// API エラー時の処理
			var onFailSoHard = function(e) {
				console.log('Error ', e);
			};

			// WebCam ストリーミングを <video> タグに描画
			window.URL = window.URL || window.webkitURL;
			navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

			navigator.getUserMedia(this.option, function(stream) {
				// WebCam Video Stream
				_this.video.src = window.URL.createObjectURL(stream);
				_this.video.volume = 0.0;
				_this.localMediaStream = stream;

				// Web Audio API の準備
				_this.audio = new Audio();
				_this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
				_this.audioSampleRate = _this.audioCtx.sampleRate;

				// ローパスフィルタを作成
				_this.lowpassFilter = _this.audioCtx.createBiquadFilter();
				_this.lowpassFilter.type = 'allpass';
				_this.lowpassFilter.frequency.value = 20000;

				// オーディオアナライザーを作成
				_this.audioAnalyser = _this.audioCtx.createAnalyser();
				_this.audioAnalyser.fftSize = 2048;
				_this.audioAnalyser.smoothingTimeContant = 0.9;

				// WebCam のマイク音声に繋ぐ
				_this.audioSource = _this.audioCtx.createMediaStreamSource(stream);
				_this.audioSource.connect(_this.lowpassFilter);
				_this.lowpassFilter.connect(_this.audioAnalyser);

				// バッファを取得
				_this.bufferLength = _this.audioAnalyser.frequencyBinCount;
				_this.dataArray = new Uint8Array(_this.bufferLength * 2);

			}, onFailSoHard);

			// カメラのサイズを取得 / 取得後 Three.js でレンダリング
			this.video.addEventListener('loadeddata', function() {
				(function getVideoResolution() { // Firefox 用 イベント取得待機処理
					_this.videoW = _this.video.videoWidth,
					_this.videoH = _this.video.videoHeight;
					if (_this.videoW != 0) {
						TweenLite.to('#js-text',  .45, { autoAlpha: 0, ease: Linear.easeInOut, delay: .1 });
						TweenLite.to('#js-mask' , .65, { scaleY: .0025, ease: Expo.easeInOut, delay: .35 });
						TweenLite.to('#js-mask' , .45, { scaleX: 0, ease: Expo.easeInOut, delay: .65, onComplete: _this._createWebGL() });
					} else {
						setTimeout(getVideoResolution, 250);
					}
				})();
			});
		};

		/*** WebGL (Three.js) 処理 ***/
		p._createWebGL = function () {
			_this = this;

			// シーンを作成
			this.scene = new THREE.Scene();
			this.scene.fog = new THREE.FogExp2(0xF6F6F6, 0.00035);

			// 画面の大きさを取得
			this.windowWidth = window.innerWidth;
			this.windowHeight = window.innerHeight;

			// 平面カメラに画角・ニアークリップ・フォアクリップを設定
			this.left   = this.videoW / -2;
			this.right  = this.videoW /  2;
			this.top    = this.videoH /  2;
			this.bottom = this.videoH / -2;
			this.near   = 1;
			this.far    = 1000;
			this.camera = new THREE.OrthographicCamera(this.left, this.right, this.top, this.bottom, this.near, this.far);

			// シーンにカメラを追加
			this.scene.add(this.camera);
			this.camera.position.z = 1000;

			// レンダラーを作成
			this.renderer = new THREE.WebGLRenderer();
			this.renderer.setPixelRatio(window.devicePixelRatio);
			this.renderer.setSize(this.videoW, this.videoH);

			// 描画する DOM を選択
			this.container = document.getElementById('js-canvas');
			this.container.appendChild(this.renderer.domElement);

			// 光源を追加
			this.light = new THREE.PointLight(0xFFFFFF, 0, 500);
			this.light.position.set(0, 500, 500);

			this.light2 = new THREE.AmbientLight(0xFFFFFF);
			this.scene.add(this.light, this.light2);

			// WebCam で取得した Video をテクスチャとして作成
			this.texture = new THREE.Texture(this.video);
			this.texture.minFilter = THREE.LinearFilter;
			this.texture.magFilter = THREE.LinearFilter;
			this.texture.format = THREE.RGBFormat;

			// マテリアル（材質）の宣言と生成
			this.videoMaterial = new THREE.MeshBasicMaterial({
				map: this.texture
			});

			// ビデオ用のジオメトリーを作成 
			this.videoGeometry = new THREE.PlaneBufferGeometry(this.videoW, this.videoH, 1, 1);
			this.videoMesh     = new THREE.Mesh(this.videoGeometry, this.videoMaterial);

			// ビデオ用のジオメトリーをシーンに追加
			this.scene.add(this.videoMesh);
			this.videoMesh.position.z  = 0;

			// GUI 表示
			this._datGUI();

			// ポストプロセス処理を追加
			this._addPostrocessing();

			// 外側のオブジェクトを作成
			this._addIcosahedronGeometry();

			// 内側のオブジェクトを作成
			this._addSphereGeometry();

			// ラインオブジェクトを作成
			this._addLineGeometry();

			// アニメーションを開始する
			this._animateCanvas();

			// イベント登録
			window.addEventListener('resize', this._onResize.bind(this), false);

		};

		/*** ポストプロセス ***/
		p._addPostrocessing = function () {
			this.composer = new THREE.EffectComposer(this.renderer);
			this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));

			// @shaders/DotScreenShader.js
			this.dotScreenPass = new THREE.ShaderPass(THREE.DotScreenShader);
			this.dotScreenPass.uniforms['scale'].value = this.dotScreenParams.scale;
			this.dotScreenPass.uniforms['angle'].value = this.dotScreenParams.angle;
			if (this.dotScreenParams.enable) this.composer.addPass(this.dotScreenPass);

			// @shaders/shaderBleach.js
			this.bleachPass = new THREE.ShaderPass(THREE.BleachBypassShader);
			this.bleachPass.uniforms['opacity'].value = this.bleachParams.opacity;
			if (this.bleachParams.enable) this.composer.addPass(this.bleachPass);

			// @shaders/HorizontalBlurShader.js
			this.hBlurPass = new THREE.ShaderPass(THREE.HorizontalBlurShader);
			this.hBlurPass.uniforms['h'].value = this.hBlurParams.h / ( this.windowWidth / 1 );
			if (this.hBlurParams.enable) this.composer.addPass(this.hBlurPass);

			// @shaders/VerticalBlurShader.js
			this.vBlurPass = new THREE.ShaderPass(THREE.VerticalBlurShader);
			this.vBlurPass.uniforms['v'].value = this.vBlurParams.v / ( this.windowHeight / 1 );
			if (this.vBlurParams.enable) this.composer.addPass(this.vBlurPass);

			// @shaders/FilmShader.js
			this.filmPass = new THREE.FilmPass( this.filmParams.sIntensity, this.filmParams.nIntensity, this.filmParams.count, true );
			if (this.filmParams.enable) this.composer.addPass(this.filmPass);

			// @shaders/ColorifyShader.js
			this.colorifyPass = new THREE.ShaderPass(THREE.ColorifyShader);
			this.colorifyPass.uniforms['color'].value.setRGB(this.colorifyParams.r, this.colorifyParams.g, this.colorifyParams.b);
			if (this.colorifyParams.enable) this.composer.addPass(this.colorifyPass);

			// @shaders/RGBShiftShader.js
			this.rgbShiftPass = new THREE.ShaderPass(THREE.RGBShiftShader);
			this.rgbShiftPass.uniforms['amount'].value = this.rgbShiftParams.amount;
			if (this.rgbShiftParams.enable) this.composer.addPass(this.rgbShiftPass);

			// @shaders/DigitalGlitch.js / postprocessing/GlitchPass.js
			this.glitchPass = new THREE.GlitchPass();
			this.glitchPass.goWild = this.glitchParams.goWild;
			if (this.glitchParams.enable) this.composer.addPass(this.glitchPass);

			// @shaders/StaticTVShader.js
			this.staticPass = new THREE.ShaderPass(THREE.StaticShader);
			this.staticPass.uniforms['amount'].value = this.staticParams.amount;
			this.staticPass.uniforms['size'].value = this.staticParams.size;
			if (this.staticParams.enable) this.composer.addPass(this.staticPass);

			// @shaders/BadTVShader.js
			this.badTVPass = new THREE.ShaderPass(THREE.BadTVShader);
			this.badTVPass.uniforms['distortion'].value = this.badTVParams.distort;
			this.badTVPass.uniforms['distortion2'].value = this.badTVParams.distort2;
			this.badTVPass.uniforms['speed'].value = this.badTVParams.speed;
			this.badTVPass.uniforms['rollSpeed'].value = this.badTVParams.rollSpeed;
			if (this.badTVParams.enable) this.composer.addPass(this.badTVPass);

			// @shaders/VignetteShader.js
			this.vignettePass = new THREE.ShaderPass(THREE.VignetteShader);
			this.vignettePass.uniforms['offset'].value   = this.vignetteParams.offset;
			this.vignettePass.uniforms['darkness'].value = this.vignetteParams.darkness;
			if (this.vignetteParams.enable) this.composer.addPass(this.vignettePass);

			// @shaders/CopyShader.js
			this.copyPass = new THREE.ShaderPass(THREE.CopyShader);
			this.composer.addPass(this.copyPass);
			this.copyPass.renderToScreen = true;

		};

		/*** 外側のオブジェクト ***/
		p._addIcosahedronGeometry = function () {
			this.icoGeometry = new THREE.IcosahedronGeometry(125, 1);
			this.icoMaterial = [
				new THREE.MeshPhongMaterial({
					shading     : THREE.AdditiveBlending,
					color       : 0xFFFFFF,
					wireframe   : true,
					fog         : true,
					transparent : true,
					opacity     : .35
				})
			];

			// ポイントクラウドを頂点座標に追加
			this.icoMesh = THREE.SceneUtils.createMultiMaterialObject(this.icoGeometry, this.icoMaterial);
			this.icoMesh.position.x = 0;
			this.icoMesh.rotation.x = 0;
			this.scene.add(this.icoMesh);

			// 頂点座標を取得
			this.icoParticleGeometry = new THREE.Geometry();
			for ( var i = 0; i < this.icoGeometry.vertices.length; i++ ) {
				_this.icoVertex = new THREE.Vector3();
				_this.icoVertex.x = _this.icoGeometry.vertices[i].x;
				_this.icoVertex.y = _this.icoGeometry.vertices[i].y;
				_this.icoVertex.z = _this.icoGeometry.vertices[i].z;
				_this.icoParticleGeometry.vertices.push(_this.icoVertex);
			}

			// ポイントを生成
			this.icoParticleMaterial = new THREE.PointsMaterial({
				blending    : THREE.AdditiveBlending,
				color       : 0xFFFFFF,
				size        : 4,
				fog         : true,
				transparent : true,
				opacity     : 1,
			});

			// ポイントを追加
			this.icoParticleMesh = new THREE.Points(this.icoParticleGeometry, this.icoParticleMaterial);
			this.icoParticleMesh.position = new THREE.Vector3(0, 0, 0);
			this.icoParticleMesh.sortParticles = false;
			this.scene.add(this.icoParticleMesh);
		};

		/*** 内側のオブジェクト ***/
		p._addSphereGeometry = function () {

			this.sphereGeometry = new THREE.SphereBufferGeometry(50, 32, 16);
			this.sphereGeometry.dynamic = true;
			this.sphereGeometry.computeFaceNormals();

			this.sphereMaterial = new THREE.MeshPhongMaterial({
				shininess   : 5,
				fog         : true,
				transparent : true,
				opacity     : 1,
				map         : this.texture,
				refractionRatio: 0.95
			});

			var _this = this;
			if (_this.sphereGeoParams.show) {
				_this.sphereGeometryMesh = new THREE.Mesh(_this.sphereGeometry, _this.sphereMaterial);
				_this.scene.add(_this.sphereGeometryMesh);
			} else {
				if (_this.sphereGeometryMesh) {
					_this.sphereGeometryMesh.geometry.dispose();
					_this.scene.remove(_this.sphereGeometryMesh);
					_this.sphereGeometry.dispose();
					_this.sphereMaterial.dispose();
				}
			}

		};

		/*** サークス状のラインを作成 ***/
		p._addLineGeometry = function () {
			this.line    = [];
			this.pos     = [];
			this.lineNum = 180;

			for ( var i = 0; i < this.lineNum; i++ ) {

				// 頂点を登録する用
				var lineGeometry = new THREE.BufferGeometry();

				// 頂点の場所を格納していくarrayを用意
				// 各頂点（x, y, z）の3つの数字があるので3倍する
				_this.pos[i] = new Float32Array(_this.lineNum * 3);

				var lineMaterial = new THREE.LineBasicMaterial({
					color       : 0xFFFFFF,
					fog         : true,
					transparent : true,
					opacity     : 1,
				});

				_this.line[i] = new THREE.Line(lineGeometry, lineMaterial);
				_this.line[i].rotation.z = i * (Math.PI / 2) / 45;

				_this.line[i].geometry.addAttribute('position', new THREE.BufferAttribute(_this.pos[i], 3));
				_this.line[i].geometry.setDrawRange(0, 2);

				_this.line[i].array = _this.line[i].geometry.attributes.position.array;
				_this.line[i].array[0] = 250; // x1
				_this.line[i].array[1] = 0;   // y1
				_this.line[i].array[2] = 0;   // z1
				_this.line[i].array[3] = 260; // x2
				_this.line[i].array[4] = 0;   // y2
				_this.line[i].array[5] = 0;   // z2
				_this.line[i].geometry.addGroup(0, 2, 0);

				_this.scene.add(_this.line[i]);
			}
		};

		/*** アニメーション ***/
		p._animateCanvas = function () {
			var _this = this, time = 0.0;
			TweenLite.ticker.addEventListener('tick', RAF);
			function RAF() {
				if ( _this.video.readyState === _this.video.HAVE_ENOUGH_DATA ) {

					_this.composer.render();
					_this.texture.needsUpdate = true;

					_this.icoMesh.rotation.x      +=  0.001;
					_this.icoMesh.rotation.y      +=  0.001;
					_this.icoParticleMesh.rotation.x  +=  0.001;
					_this.icoParticleMesh.rotation.y  +=  0.001;
					if (_this.sphereGeoParams.show) _this.sphereGeometryMesh.rotation.x += -0.0025;
					if (_this.sphereGeoParams.show) _this.sphereGeometryMesh.rotation.y += -0.0025;

					_this.dataArray = new Uint8Array(_this.bufferLength);
					_this.audioAnalyser.getByteFrequencyData(_this.dataArray);

					for (var i = 0; i < _this.lineNum; i++) {

						// アニメーション変数
						var animVal = Math.cos(_this.dataArray[i] / _this.lineNum);
						if (_this.hBlurParams.enable) var hBlurPass = _this.hBlurParams.h / ( _this.windowWidth  * ( (_this.bufferLength / _this.dataArray[i]) / _this.lineNum * 7.5 ) );
						if (_this.vBlurParams.enable) var vBlurPass = _this.vBlurParams.v / ( _this.windowHeight * ( (_this.bufferLength / _this.dataArray[i]) / _this.lineNum * 7.5 ) );
						if (_this.rgbShiftParams.enable) var rgbShift = animVal / 512;

						// エフェクトアップデート
						if (_this.hBlurParams.enable) _this.hBlurPass.uniforms['h'].value = hBlurPass;
						if (_this.vBlurParams.enable) _this.vBlurPass.uniforms['v'].value = vBlurPass;
						if (_this.rgbShiftParams.enable) _this.rgbShiftPass.uniforms['amount'].value = _this.rgbShiftParams.amount + rgbShift;

						// オーディオアップデート
						_this.line[i].geometry.verticesNeedUpdate = true;
						_this.line[i].geometry.attributes.position.needsUpdate = true;
						_this.line[i].geometry.attributes.position.array[0] = 250;
						_this.line[i].geometry.attributes.position.array[3] = 260 - animVal * _this.lineNum / 3;
						_this.line[i].rotation.z += 0.0005;

					}

					// シェーダーに経過時間を送る
					_this.filmPass.uniforms['time'].value = time;
					_this.badTVPass.uniforms['time'].value = time;
					_this.staticPass.uniforms['time'].value = time;
					time += 0.05;

				}
			}
		};

		/*** キャンバスを画像に変換 ***/
		p._canvasToImage = function () {

			// Visibility Hidden か Display None 状態じゃないとキャプチャが撮れない不具合対策
			TweenLite.to('#js-canvas', .15, { autoAlpha: 0, ease: Linear.easeInOut, onComplete: function() {
				setTimeout(function() {
					saveImage();
					TweenLite.to('#js-canvas', .15, { autoAlpha: 1, clearProps: 'all', ease: Linear.easeInOut });
				}, 5); }
			});

			function saveImage() {
				var canvas = document.getElementsByTagName('canvas')[0],
				    base64 = canvas.toDataURL('image/jpeg'),
				    blob   = base64toBlob(base64);

				saveBlob(blob, 'screenshot-' + new Date().getTime() + '.jpg');

				function base64toBlob(base64) {
					var i, tmp = base64.split(','),
					    data = atob(tmp[1]),
					    mime = tmp[0].split(':')[1].split(';')[0],
					    arr = new Uint8Array(data.length);

					for (i = 0; i < data.length; i++) {
						arr[i] = data.charCodeAt(i);
					}

					var blob = new Blob([arr], { type: mime });
					return blob;
				}

				function saveBlob(blob, file) {
					if ( /* @cc_on ! @*/ false ) {
						window.navigator.msSaveBlob(blob, file);
					} else {
						var url = (window.URL || window.webkitURL),
						    data = url.createObjectURL(blob),
						    e = document.createEvent('MouseEvents'),
						    a = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');

						e.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
						a.href = data;
						a.download = file;
						a.dispatchEvent(e);
					}
				}

			}

		};

		/*** GUI ***/
		p._datGUI = function () {

			// Settings
			this.sphereGeoParams = {
				show      : false,
			},
			this.dotScreenParams = {
				enable    : false,
				scale     : 2.0,
				angle     : 1.0
			},
			this.bleachParams = {
				enable    : true,
				opacity   : 0.15
			},
			this.hBlurParams = {
				enable    : true,
				h         : 2.0
			},
			this.vBlurParams = {
				enable    : false,
				v         : 2.0
			},
			this.filmParams = {
				enable    : true,
				sIntensity: 0.15,
				nIntensity: 0.25,
				count     : 1000
			},
			this.colorifyParams = {
				enable    : true,
				r         : 0.30,
				g         : 0.35,
				b         : 0.35
			},
			this.rgbShiftParams = {
				enable    : true,
				amount    : 0.004
			},
			this.glitchParams = {
				enable    : false,
				goWild    : false
			},
			this.staticParams = {
				enable    : false,
				amount    : 0.05,
				size      : 4
			},
			this.badTVParams = {
				enable    : false,
				distort   : 3.0,
				distort2  : 1.0,
				speed     : 0.25,
				rollSpeed : 0.15
			},
			this.vignetteParams = {
				enable    : true,
				offset    : 0.5,
				darkness  : 2.6
			},
			this.saveImageParams = {
				save : function() { _this._canvasToImage(); }
			}

			// Init dat.GUI
			this.gui = new dat.GUI({ autoPlace: true });
			this.gui.close();

			// Sphere Geometry
			this.sphereGeo = this.gui.addFolder('Sphere Geometry');
			this.sphereGeo.add(this.sphereGeoParams, 'show').onChange(this._addSphereGeometry.bind(this));
			// this.sphereGeo.open();

			// Dot Screen
			this.dotScreen = this.gui.addFolder('Dot Screen');
			this.dotScreen.add(this.dotScreenParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.dotScreen.add(this.dotScreenParams, 'scale', 0.0, 3).onChange(this._addPostrocessing.bind(this));
			this.dotScreen.add(this.dotScreenParams, 'angle', 0.0, 8).onChange(this._addPostrocessing.bind(this));
			// this.dotScreen.open();

			// Bleach Effect
			this.guiBleach = this.gui.addFolder('Bleach');
			this.guiBleach.add(this.bleachParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.guiBleach.add(this.bleachParams, 'opacity', 0.0, 1.0).onChange(this._addPostrocessing.bind(this));
			// this.guiBleach.open();

			// Horizontal Blur
			this.hBlur = this.gui.addFolder('Horizontal Blur');
			this.hBlur.add(this.hBlurParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.hBlur.add(this.hBlurParams, 'h', 0.0, 5.0).name('blur').onChange(this._addPostrocessing.bind(this));
			// this.hBlur.open();

			// Vertical Blur
			this.vBlur = this.gui.addFolder('Vertical Blur');
			this.vBlur.add(this.vBlurParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.vBlur.add(this.vBlurParams, 'v', 0.0, 5.0).name('blur').onChange(this._addPostrocessing.bind(this));
			// this.vBlur.open();

			// Film
			this.film = this.gui.addFolder('Film');
			this.film.add(this.filmParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.film.add(this.filmParams, 'sIntensity', 0.0, 2.0).name('depth').step(0.1).onChange(this._addPostrocessing.bind(this));
			this.film.add(this.filmParams, 'nIntensity', 0.0, 2.0).name('depth 2').step(0.1).onChange(this._addPostrocessing.bind(this));
			this.film.add(this.filmParams, 'count', 0.0, 2000).onChange(this._addPostrocessing.bind(this));
			// this.film.open();

			// Colorify
			this.colorify = this.gui.addFolder('Colorify');
			this.colorify.add(this.colorifyParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.colorify.add(this.colorifyParams, 'r', 0.0, 1.0).onChange(this._addPostrocessing.bind(this));
			this.colorify.add(this.colorifyParams, 'g', 0.0, 1.0).onChange(this._addPostrocessing.bind(this));
			this.colorify.add(this.colorifyParams, 'b', 0.0, 1.0).onChange(this._addPostrocessing.bind(this));
			// this.colorify.open();

			// RGB Shift
			this.rgb = this.gui.addFolder('RGB Shift');
			this.rgb.add(this.rgbShiftParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.rgb.add(this.rgbShiftParams, 'amount', -0.01, 0.01).step(0.001).onChange(this._addPostrocessing.bind(this));
			// this.rgb.open();

			// Glitch
			this.glitch = this.gui.addFolder('Glitch');
			this.glitch.add(this.glitchParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.glitch.add(this.glitchParams, 'goWild').name('wild').onChange(this._addPostrocessing.bind(this));
			// this.glitch.open();

			// Static
			this.static = this.gui.addFolder('Static');
			this.static.add(this.staticParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.static.add(this.staticParams, 'amount', 0.0, 0.3).step(0.01).onChange(this._addPostrocessing.bind(this));
			this.static.add(this.staticParams, 'size', 0.0, 50).step(1.0).onChange(this._addPostrocessing.bind(this));
			// this.static.open();

			// Bad TV
			this.badTV = this.gui.addFolder('Bad TV');
			this.badTV.add(this.badTVParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.badTV.add(this.badTVParams, 'distort', 0.0, 10).step(0.1).name('thick').onChange(this._addPostrocessing.bind(this));
			this.badTV.add(this.badTVParams, 'distort2', 0.0, 10).step(0.1).name('fine').onChange(this._addPostrocessing.bind(this));
			this.badTV.add(this.badTVParams, 'speed', 0.0, 1.0).step(0.01).name('speed').onChange(this._addPostrocessing.bind(this));
			this.badTV.add(this.badTVParams, 'rollSpeed', 0.0, 1.0).step(0.01).name('roll').onChange(this._addPostrocessing.bind(this));
			// this.badTV.open();

			// Vignette Effect
			this.vignette = this.gui.addFolder('Vignette');
			this.vignette.add(this.vignetteParams, 'enable').onChange(this._addPostrocessing.bind(this));
			this.vignette.add(this.vignetteParams, 'offset', 0.0, 1.0).onChange(this._addPostrocessing.bind(this));
			this.vignette.add(this.vignetteParams, 'darkness', 0.0, 5.0).onChange(this._addPostrocessing.bind(this));
			// this.vignette.open();

			// Save Image
			this.saveImage = this.gui.add(this.saveImageParams, 'save').name('Save Image');

		};

		/*** リサイズ処理 ***/
		p._onResize = function () {
			this.renderer.setSize(this.videoW, this.videoH);
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
		};

		return WebCam;

	}());

	// Fire !
	window.addEventListener('load', function() {
		$.when(
			$.ajax({ url: './assets/js/vendor/threejs/shaders/CopyShader.js?noChace=' + new Date().getTime(),            dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/BleachBypassShader.js?noChace=' + new Date().getTime(),    dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/ColorifyShader.js?noChace=' + new Date().getTime(),        dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/ConvolutionShader.js?noChace=' + new Date().getTime(),     dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/DotScreenShader.js?noChace=' + new Date().getTime(),       dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/DigitalGlitch.js?noChace=' + new Date().getTime(),         dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/FilmShader.js?noChace=' + new Date().getTime(),            dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/RGBShiftShader.js?noChace=' + new Date().getTime(),        dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/HorizontalBlurShader.js?noChace=' + new Date().getTime(),  dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/VerticalBlurShader.js?noChace=' + new Date().getTime(),    dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/VignetteShader.js?noChace=' + new Date().getTime(),        dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/BadTVShader.js?noChace=' + new Date().getTime(),           dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/shaders/StaticShader.js?noChace=' + new Date().getTime(),          dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/postprocessing/EffectComposer.js?noChace=' + new Date().getTime(), dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/postprocessing/RenderPass.js?noChace=' + new Date().getTime(),     dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/postprocessing/ShaderPass.js?noChace=' + new Date().getTime(),     dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/postprocessing/MaskPass.js?noChace=' + new Date().getTime(),       dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/postprocessing/FilmPass.js?noChace=' + new Date().getTime(),       dataType: 'script' }),
			$.ajax({ url: './assets/js/vendor/threejs/postprocessing/GlitchPass.js?noChace=' + new Date().getTime(),     dataType: 'script' })
		)
		.done(function() {
			var webcamEffects = new WebCam();
			console.log('WebCam Effects ver.' + WEBCAM.info.ver);
		})
		.fail(function() { });
	}, false);

})(WEBCAM || (WEBCAM = {}));
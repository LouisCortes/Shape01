

'use strict';


const canvas = document.getElementsByTagName('canvas')[0];
resizeCanvas();

let config = {
  //  DYE_RESOLUTION: 512,
    PAUSED: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    TRANSPARENT: false,
  //  SUNRAYS: true,
  //  SUNRAYS_RESOLUTION: 1024,
}

function pointerPrototype () {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
}

let pointers = [];
let splatStack = [];
let mousez = 0;
let s1 = 0;
let s2 = 0;
let s3 = 0.5;
let s4 = 0;
let s5 = 0;
let p1 = 0;
pointers.push(new pointerPrototype());

const { gl, ext } = getWebGLContext(canvas);

if (isMobile()) {
    config.DYE_RESOLUTION = 512;
  //  config.SUNRAYS_RESOLUTION = 512;
}
if (!ext.supportLinearFiltering) {
  //  config.DYE_RESOLUTION = 512;
//  config.SUNRAYS_RESOLUTION = 512;

}

function getWebGLContext (canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2)
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2)
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    }
    else
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    ga('send', 'event', isWebGL2 ? 'webgl2' : 'webgl', formatRGBA == null ? 'not supported' : 'supported');

    return {
        gl,
        ext: {
            formatRGBA,
            formatRG,
            formatR,
            halfFloatTexType,
            supportLinearFiltering
        }
    };
}

function getSupportedFormat (gl, internalFormat, format, type)
{
    if (!supportRenderTextureFormat(gl, internalFormat, format, type))
    {
        switch (internalFormat)
        {
            case gl.R16F:
                return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
            case gl.RG16F:
                return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
            default:
                return null;
        }
    }

    return {
        internalFormat,
        format
    }
}

function supportRenderTextureFormat (gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status == gl.FRAMEBUFFER_COMPLETE;
}


function isMobile () {
    return /Mobi|Android/i.test(navigator.userAgent);
}

function framebufferToTexture (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    let length = target.width * target.height * 4;
    let texture = new Float32Array(length);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
    return texture;
}


class Material {
    constructor (vertexShader, fragmentShaderSource) {
        this.vertexShader = vertexShader;
        this.fragmentShaderSource = fragmentShaderSource;
        this.programs = [];
        this.activeProgram = null;
        this.uniforms = [];
    }

    setKeywords (keywords) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null)
        {
            let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
            program = createProgram(this.vertexShader, fragmentShader);
            this.programs[hash] = program;
        }

        if (program == this.activeProgram) return;

        this.uniforms = getUniforms(program);
        this.activeProgram = program;
    }

    bind () {
        gl.useProgram(this.activeProgram);
    }
}

class Program {
    constructor (vertexShader, fragmentShader) {
        this.uniforms = {};
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program);
    }

    bind () {
        gl.useProgram(this.program);
    }
}

function createProgram (vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.trace(gl.getProgramInfoLog(program));

    return program;
}

function getUniforms (program) {
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        let uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
}

function compileShader (type, source, keywords) {
    source = addKeywords(source, keywords);

    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.trace(gl.getShaderInfoLog(shader));

    return shader;
};

function addKeywords (source, keywords) {
    if (keywords == null) return source;
    let keywordsString = '';
    keywords.forEach(keyword => {
        keywordsString += '#define ' + keyword + '\n';
    });
    return keywordsString + source;
}

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        /*vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);*/
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float time;
    uniform vec2 resolution;
    const float b = sqrt(64.);
    void main () {
      vec2 uv = vUv;
        //vec4 t = texture2D(uTexture,uv);
        float c = 0.;

     float d = pow(length(uv.y-0.5)*2.,2.)*0.003;
     for(float i = -0.5*b; i<=0.5*b ; i +=1.)
     for(float j = -0.5*b; j<=0.5*b ; j +=1.){
     c += texture2D(uTexture,uv+vec2(i,j)*d).z;
     }
     c /= 64.;

      gl_FragColor = vec4(pow(c,0.5));
    }
`;


const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
uniform float time;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform vec2 resolution;
    uniform vec2 mouse;
    uniform float mousez;
    uniform float s1;
    uniform float s2;
    uniform float s3;
    uniform float s4;
    uniform float s5;
    uniform float test2;
    const float b  = sqrt(12.);
    float se;
  float zl;
  float rd(){return fract(sin(se+=1.)*7845.236);}
  vec3 vr(){float sr = rd()*6.28;
    float sa = rd();
    float a = sqrt(1.-sa*sa);
    vec3 vn = vec3(a*cos(sr),a*sin(sr),(sa-0.5)*2.);
    return vn*sqrt(rd());}
  mat2 rot(float t){ float c = cos(t); float s = sin(t); return mat2(c,-s,s,c);}

float dd1 (vec3 p ){
     float pi = 3.14159;
     p *= (1.-s2*0.525);
  float d1 = 1000.;
  for(int  i = 1 ; i < 11 ; i++){
  float fa = atan(p.x,p.y)*(1.+floor(s1*7.))+float(i)*pi*(0.1+0.15*s5);
  float ra = cos(fa);
  float ra2 = sin(fa);
   d1 = min(d1,length(length(vec2(length(p.xy)-(8.-5.*s2)+ra,p.z+ra2*mix(1.,5.,s4))))-0.5+(-s3+0.5)*0.6);
   }
   return d1;
}

  float map(vec3 p){
    float d2 =min(-p.y+10.,p.y+10.);
    float d4 = (length(p.xz)-21.);
    p.xz *= rot((mouse.x-0.5)*3.14*4.);
    p.yz *= rot((mouse.y-0.5)*3.14*4.);
    zl = d2;

  float d1 = dd1(p);
  float d3 = max(-10000.,-d4);
    return min(d1,d3);}

    float rm(vec3 p, vec3 r){
      float dd= 0.;
      for(int  i = 0 ;i<40;i++){
        float d = map(p);
        if(d<-1.){break;}
        p += r*d;
        dd +=d;
      }return dd;}
      vec3 nor(vec3 p){ vec2 e  = vec2(0.01,0.); return normalize(map(p)-vec3(map(p-e.xyy),map(p-e.yxy),map(p-e.yyx)));}
      vec2 render(vec3 p, vec3 r){
       float dd = 0.;
       float r1 = 0.;
        for(int  i = 0 ; i <3 ;i++){
        float d = rm(p,r);
        if (i == 0 ){dd =step( d,30.);}
          if(step(0.5,zl)>0.){
            vec3 pp = p+r*d;
            vec3 n = nor(pp);
            r = n*vr();
            p = pp +0.1*r;
          }
          else{r1=1.;break;}
        }
          return vec2(r1,dd);}
    void main () {
        vec2 uv = -1. + 2. *  vUv;
    vec2 uc = vUv;
    float fac = resolution.x/resolution.y;
    uv.x *=fac;
  se = uv.x*resolution.y+uv.y;
  se += time;
  vec3 p = vec3(0.,0.,-19.);
  vec3 r  = normalize(vec3(uv,1.5));
  float ss = 0.96;
      float iframe = mix(texture2D(uTarget,uc).a, 0.0, clamp(mousez+test2, 0.0, 1.0));
  {
    ss += mix(0.00, 0.1, clamp(iframe / 400.0, 0.0, 1.0));
      ss = clamp(ss, 0.0, 1.);
  }
//  vec2 res  = render(p,r);
vec2 res = ss==1.?texture2D(uTarget,uc).xy: render(p,r);
  float r1 = res.x;
  float dd =res.y;


    float c = 0.;

    for(float k = -0.5*b; k<=0.5*b ; k +=1.)
    for(float j = -0.5*b; j<=0.5*b ; j +=1.){
    c += texture2D(uTarget,uc+vec2(k,j)*0.002).y;
    }
    c /= 12.;
    c = smoothstep(0.5,1.,c);
    float c2 = mix(dd,c,step(mousez+test2,0.));
    float rr= mix(r1, texture2D(uTarget,uc).x, mix(ss, 0.0, clamp(mousez+test2, 0.0, 1.0)));
      gl_FragColor = vec4(rr,dd,rr*c2, iframe + 1.0);
    //    gl_FragColor = vec4(test2,test2,test2, iframe + 1.0);
    }
`);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (target, clear = false) => {
        if (target == null)
        {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        else
        {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }

        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

function CHECK_FRAMEBUFFER_STATUS () {
    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status != gl.FRAMEBUFFER_COMPLETE)
        console.trace("Framebuffer error: " + status);
}

let dye;

const splatProgram           = new Program(baseVertexShader, splatShader);


const displayMaterial = new Material(baseVertexShader, displayShaderSource);

function initFramebuffers () {

    let dyeRes = getResolution(gl.drawingBufferWidth);

    const texType = ext.halfFloatTexType;
    const rgba    = ext.formatRGBA;
    const rg      = ext.formatRG;
    const r       = ext.formatR;
    //const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

  //  if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType,  gl.LINEAR);
  //  else
      //  dye = resizeDoubleFBO(dye,canvas.width*0.5, canvas.height*0.5, rgba.internalFormat, rgba.format, texType, filtering);


    //initSunraysFramebuffers();
}


function createFBO (w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texelSizeX = 1.0 / w;
    let texelSizeY = 1.0 / h;

    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function createDoubleFBO (w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);

    return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read () {
            return fbo1;
        },
        set read (value) {
            fbo1 = value;
        },
        get write () {
            return fbo2;
        },
        set write (value) {
            fbo2 = value;
        },
        swap () {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

function updateKeywords () {
    let displayKeywords = [];
  //  if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
    displayMaterial.setKeywords(displayKeywords);
}

updateKeywords();
initFramebuffers();

let lastUpdateTime = Date.now();
update();

function update () {
  //  const dt = calcDeltaTime();
    if (resizeCanvas())
        initFramebuffers();
//    updateColors(dt);
    //applyInputs();
  /*  if (!config.PAUSED)
        step(dt);*/
        splat();
    render(null);
    requestAnimationFrame(update);
}

function calcDeltaTime () {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
}

function resizeCanvas () {
    let width = scaleByPixelRatio(canvas.clientWidth);
    let height = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}

/*function applyInputs () {

  //  pointers.forEach(p => {splatPointer();});
  //splatPointer( pointers[0]);
  splat();
}*/

function render (target) {

      //  applySunrays(dye.read, dye.write, sunrays);
    drawDisplay(target);
}

function drawDisplay (target) {
    let width = target == null ? gl.drawingBufferWidth : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;

    displayMaterial.bind();
  gl.uniform1f(displayMaterial.uniforms.time, performance.now() / 1000);
  gl.uniform2f(displayMaterial.uniforms.resolution, canvas.width , canvas.height);

    blit(target);
}

/*function applySunrays (source, mask, destination) {
    gl.disable(gl.BLEND);
    sunraysProgram.bind();
    gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
    blit(destination);
}*/

/*function splatPointer (pointer) {

    splat(pointers[0].texcoordX, pointers[0].texcoordY);
}*/

function gene(value, sliderId) {
  switch (sliderId) {
    case 'slider1':
      document.getElementById("slider1-value").textContent = value.toFixed(2);
      s1 = value;
      break;
    case 'slider2':
    document.getElementById("slider2-value").textContent = value.toFixed(2);
      s2 = value;
      break;
    case 'slider3':
    document.getElementById("slider3-value").textContent = value.toFixed(2);
      s3 = value;
      break;
      case 'slider4':
      document.getElementById("slider4-value").textContent = value.toFixed(2);
        s4 = value;
        break;
      case 'slider5':
      document.getElementById("slider5-value").textContent = value.toFixed(2);
        s5 = value;
        break;

    default:
      break;
  }
}
function gene2 (value2){
  p1 = value2;
}
function splat () {
  let dyeRes = getResolution(gl.drawingBufferWidth);
    splatProgram.bind();
    gl.uniform1f(splatProgram.uniforms.time, performance.now() / 1000);
    gl.uniform2f(splatProgram.uniforms.resolution, dyeRes.width , dyeRes.height);
    gl.uniform2f(splatProgram.uniforms.mouse, pointers[0].texcoordX, pointers[0].texcoordY);
    gl.uniform1f(splatProgram.uniforms.mousez, mousez);
    gl.uniform1f(splatProgram.uniforms.s1,s1);
    gl.uniform1f(splatProgram.uniforms.s2,s2);
    gl.uniform1f(splatProgram.uniforms.s3,s3);
    gl.uniform1f(splatProgram.uniforms.s4,s4);
    gl.uniform1f(splatProgram.uniforms.s5,s5);
    gl.uniform1f(splatProgram.uniforms.test2,p1);
    //gl.uniform2f(splatProgram.uniforms.prevmouse, pointers[0].prevTexcoordX, pointers[0].prevTexcoordY);
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    blit(dye.write);
    dye.swap();
}

canvas.addEventListener('mousedown', e => {
  //navigator.vibrate(200);
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    //let pointer = pointers.find(p => p.id == -1);
    let pointer = pointers[0];
    mousez = 1;
    if (pointer == null)
        pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', e => {
    let pointer = pointers[0];
    if (!pointer.down) return;
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
 navigator.vibrate(200);
    updatePointerUpData(pointers[0]);
    mousez = 0;
});

canvas.addEventListener('touchstart', e => {
  navigator.vibrate(100);
    e.preventDefault();
    const touches = e.targetTouches;
    while (touches.length >= pointers.length)
        pointers.push(new pointerPrototype());
  //  for (let i = 0; i < touches.length; i++) {
        let posX = scaleByPixelRatio(touches[0].pageX);
        let posY = scaleByPixelRatio(touches[0].pageY);
        //updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
        updatePointerDownData(pointers[0], touches[0].identifier, posX, posY);
  //  }
});

canvas.addEventListener('touchmove', e => {
  //navigator.vibrate(10);
    e.preventDefault();
    const touches = e.targetTouches;
  //  for (let i = 0; i < touches.length; i++) {
        //let pointer = pointers[i + 1];
        let pointer = pointers[0];
        //if (!pointer.down) continue;
        let posX = scaleByPixelRatio(touches[0].pageX);
        let posY = scaleByPixelRatio(touches[0].pageY);
        updatePointerMoveData(pointer, posX, posY);
  //  }
}, false);

window.addEventListener('touchend', e => {
  navigator.vibrate(100);
    const touches = e.changedTouches;
  //  for (let i = 0; i < touches.length; i++)
  //  {
        let pointer = pointers.find(p => p.id == touches[0].identifier);
        //if (pointer == null) continue;
        updatePointerUpData(pointer);
  //  }
});


function updatePointerDownData (pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
}

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
    pointer.down = false;
}

function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

/*function wrap (value, min, max) {
    let range = max - min;
    if (range == 0) return min;
    return (value - min) % range + min;
}*/

function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1)
        aspectRatio = 1.0 / aspectRatio;

    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}

function getTextureScale (texture, width, height) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}

function scaleByPixelRatio (input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

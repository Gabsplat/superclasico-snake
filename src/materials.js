import * as THREE from 'three';

// Borde de luz tipo dibujo animado (fresnel) sobre MeshStandardMaterial.
export function rimify(material, color = '#ffffff', strength = 0.6, power = 2.6) {
  const rim = { value: new THREE.Color(color).multiplyScalar(strength) };
  material.userData.rim = rim;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vd = normalize(vViewPosition);
          float rimF = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), ${power.toFixed(2)});
          totalEmissiveRadiance += uRim * rimF;
        }`,
      );
  };
  material.customProgramCacheKey = () => `rim${power}`;
  return material;
}

export function toon(color, { roughness = 0.45, metalness = 0, rim = '#ffffff', rimStrength = 0.45, map = null, emissive = null, emissiveIntensity = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, map });
  if (emissive) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = emissiveIntensity;
  }
  return rimify(m, rim, rimStrength);
}

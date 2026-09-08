import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
/** Static meshes merge by material and 40m cell. Animated hierarchies and instances survive. */
export function batchStatic(root){
 root.updateMatrixWorld(true);const cells=new Map(),remove=[];const pos=new THREE.Vector3();let before=0;
 root.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.userData.noBatch||o.userData.isOutline||o.children.some(c=>c.userData.isOutline)||Array.isArray(o.material))return;before++;let a=o,cellSize=40;while(a&&a!==root){if(a.userData.dynamic)return;if(a.userData.batchCell)cellSize=a.userData.batchCell;a=a.parent;}o.getWorldPosition(pos);const key=`${Math.floor(pos.x/cellSize)},${Math.floor(pos.z/cellSize)}:${o.material.uuid}:${o.castShadow}:${o.receiveShadow}`;
 if(!cells.has(key))cells.set(key,{parts:[],mat:o.material,cast:o.castShadow,receive:o.receiveShadow});let geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);if(geo.index){const flat=geo.toNonIndexed();geo.dispose();geo=flat;}for(const name of Object.keys(geo.attributes)){if(!['position','normal','uv'].includes(name))geo.deleteAttribute(name);}if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));cells.get(key).parts.push(geo);remove.push(o);});
 const batch=new THREE.Group();batch.name='spatial material batches';for(const[key,c]of cells){const geo=mergeGeometries(c.parts,false);c.parts.forEach(g=>g.dispose());if(!geo)continue;geo.computeBoundingSphere();const m=new THREE.Mesh(geo,c.mat);m.name=key;m.castShadow=c.cast;m.receiveShadow=c.receive;batch.add(m);}for(const o of remove)o.removeFromParent();root.add(batch);return {sourceMeshes:before,staticBatches:cells.size};
}

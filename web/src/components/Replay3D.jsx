import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, Grid, OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { carDisplayPos } from './TrackMap.jsx'

// Normalize the pole lap's x/y into centered world units on the XZ ground
// plane (data-y maps to world Z; world Y is height).
function useGeom(drivers) {
  return useMemo(() => {
    const pole = drivers[0].channels
    const xs = pole.x
    const ys = pole.y
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < minX) minX = xs[i]
      if (xs[i] > maxX) maxX = xs[i]
      if (ys[i] < minY) minY = ys[i]
      if (ys[i] > maxY) maxY = ys[i]
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const s = 120 / Math.max(maxX - minX, maxY - minY)
    const toWorld = (x, y) => [(x - cx) * s, (y - cy) * s]
    const points = []
    for (let i = 0; i < xs.length; i++) {
      const [X, Z] = toWorld(xs[i], ys[i])
      points.push([X, 0.05, Z])
    }
    points.push(points[0]) // close the loop
    return { points, toWorld }
  }, [drivers])
}

// Cars as glowing spheres, positioned imperatively each frame from the shared
// clock (timeRef). Hidden when a selection isolates other drivers.
function Cars({ drivers, pole, timeRef, selected, toWorld, onToggle }) {
  const meshes = useRef([])
  useFrame(() => {
    const t = timeRef.current
    for (let i = 0; i < drivers.length; i++) {
      const m = meshes.current[i]
      if (!m) continue
      const d = drivers[i]
      const visible = selected.length === 0 || selected.includes(d.code)
      m.visible = visible
      if (!visible) continue
      const p = carDisplayPos(d.channels, pole.x, pole.y, t)
      const [X, Z] = toWorld(p.x, p.y)
      m.position.set(X, 0.9, Z)
    }
  })
  return (
    <>
      {drivers.map((d, i) => {
        const isSel = selected.includes(d.code)
        return (
          <mesh
            key={d.code}
            ref={(el) => (meshes.current[i] = el)}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(d.code)
            }}
          >
            <sphereGeometry args={[isSel ? 1.7 : 1.1, 18, 18]} />
            <meshStandardMaterial
              color={d.color}
              emissive={d.color}
              emissiveIntensity={isSel ? 2.4 : 1.3}
              toneMapped={false}
            />
          </mesh>
        )
      })}
    </>
  )
}

export default function Replay3D({ drivers, timeRef, selected, onToggle }) {
  const { points, toWorld } = useGeom(drivers)
  const pole = drivers[0].channels
  return (
    <Canvas
      camera={{ position: [0, 95, 95], fov: 38 }}
      dpr={[1, 1.75]}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#0a0c0f']} />
      {/* Fog pulls the infinite grid down into the background, giving the scene
          cinematic depth falloff without the perf/readability cost of DOF
          (which would blur the very cars you're tracking). */}
      <fog attach="fog" args={['#0a0c0f', 120, 330]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[40, 80, 20]} intensity={0.5} />
      <Grid
        args={[400, 400]}
        cellSize={10}
        sectionSize={60}
        cellColor="#161b21"
        sectionColor="#2c333d"
        fadeDistance={360}
        fadeStrength={3}
        infiniteGrid
        position={[0, -0.02, 0]}
      />
      <Line points={points} color="#ff3b30" lineWidth={3} />
      <Cars drivers={drivers} pole={pole} timeRef={timeRef} selected={selected} toWorld={toWorld} onToggle={onToggle} />
      <OrbitControls
        enablePan={false}
        minDistance={70}
        maxDistance={240}
        maxPolarAngle={Math.PI / 2.15}
      />
      <EffectComposer>
        <Bloom intensity={0.95} luminanceThreshold={0.2} luminanceSmoothing={0.28} radius={0.7} mipmapBlur />
        <Vignette offset={0.28} darkness={0.72} eskil={false} />
      </EffectComposer>
    </Canvas>
  )
}

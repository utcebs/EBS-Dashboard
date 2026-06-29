import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ---- Tunables ---------------------------------------------------------------
const NODE_COUNT = 90
const CONNECT_DIST = 2.2        // max distance between two nodes that draws a line
const BOUND = 5                 // half-size of the cube the nodes float in
const NODE_SPEED = 0.15         // units per second — gentle drift

// ---- Scene -----------------------------------------------------------------
function Nodes() {
  const pointsRef = useRef()
  const linesRef = useRef()

  // seed node positions + velocities
  const nodes = useMemo(() => {
    const arr = []
    for (let i = 0; i < NODE_COUNT; i++) {
      arr.push({
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * BOUND * 2,
          (Math.random() - 0.5) * BOUND * 2,
          (Math.random() - 0.5) * BOUND * 2
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * NODE_SPEED,
          (Math.random() - 0.5) * NODE_SPEED,
          (Math.random() - 0.5) * NODE_SPEED
        ),
      })
    }
    return arr
  }, [])

  // pre-allocated buffers
  const positions = useMemo(() => new Float32Array(NODE_COUNT * 3), [])
  const linePositions = useMemo(() => new Float32Array(NODE_COUNT * NODE_COUNT * 3 * 2), [])
  const lineColors = useMemo(() => new Float32Array(NODE_COUNT * NODE_COUNT * 3 * 2), [])

  useFrame((_, delta) => {
    // advance nodes with gentle wall bounce
    for (let i = 0; i < NODE_COUNT; i++) {
      const n = nodes[i]
      n.pos.addScaledVector(n.vel, delta)
      if (Math.abs(n.pos.x) > BOUND) n.vel.x *= -1
      if (Math.abs(n.pos.y) > BOUND) n.vel.y *= -1
      if (Math.abs(n.pos.z) > BOUND) n.vel.z *= -1
      positions[i * 3 + 0] = n.pos.x
      positions[i * 3 + 1] = n.pos.y
      positions[i * 3 + 2] = n.pos.z
    }

    if (pointsRef.current) {
      pointsRef.current.geometry.attributes.position.array = positions
      pointsRef.current.geometry.attributes.position.needsUpdate = true
    }

    // rebuild connection lines per-frame (O(n²) but n=90 is fine)
    // Saturated gold tones modulated by distance — reads clearly gold, not silver
    let lineIdx = 0
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const d = nodes[i].pos.distanceTo(nodes[j].pos)
        if (d < CONNECT_DIST) {
          const alpha = 1 - d / CONNECT_DIST  // 0..1, fades with distance
          const intensity = 0.70 + alpha * 0.30
          // Saturated gold ≈ #f2b859 — R high, G mid, B low.
          const r = intensity * 0.95
          const g = intensity * 0.72
          const b = intensity * 0.35
          linePositions[lineIdx * 3 + 0] = nodes[i].pos.x
          linePositions[lineIdx * 3 + 1] = nodes[i].pos.y
          linePositions[lineIdx * 3 + 2] = nodes[i].pos.z
          lineColors[lineIdx * 3 + 0] = r
          lineColors[lineIdx * 3 + 1] = g
          lineColors[lineIdx * 3 + 2] = b
          lineIdx++
          // segment end
          linePositions[lineIdx * 3 + 0] = nodes[j].pos.x
          linePositions[lineIdx * 3 + 1] = nodes[j].pos.y
          linePositions[lineIdx * 3 + 2] = nodes[j].pos.z
          lineColors[lineIdx * 3 + 0] = r
          lineColors[lineIdx * 3 + 1] = g
          lineColors[lineIdx * 3 + 2] = b
          lineIdx++
        }
      }
    }
    if (linesRef.current) {
      linesRef.current.geometry.setDrawRange(0, lineIdx)
      linesRef.current.geometry.attributes.position.needsUpdate = true
      linesRef.current.geometry.attributes.color.needsUpdate = true
    }

    // slow global rotation — gives the scene presence without motion sickness
    if (pointsRef.current) {
      pointsRef.current.parent.rotation.y += delta * 0.05
      pointsRef.current.parent.rotation.x += delta * 0.02
    }
  })

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={NODE_COUNT}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.18}
          color="#daab68"
          sizeAttenuation
          transparent
          opacity={1}
          depthWrite={false}
        />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={NODE_COUNT * NODE_COUNT * 2}
            array={linePositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={NODE_COUNT * NODE_COUNT * 2}
            array={lineColors}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.7} depthWrite={false} />
      </lineSegments>
    </group>
  )
}

// Reduced-motion / no-WebGL fallback
function StaticFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="0 0 400 400" className="w-full h-full max-w-md opacity-70">
        <defs>
          <radialGradient id="rg" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#e6cf94" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#caa15a" stopOpacity="0.1" />
          </radialGradient>
        </defs>
        {Array.from({ length: 30 }).map((_, i) => {
          const a = (i / 30) * Math.PI * 2
          const r = 120 + (i % 3) * 30
          const x = 200 + Math.cos(a) * r
          const y = 200 + Math.sin(a) * r
          return <circle key={i} cx={x} cy={y} r={3} fill="#daab68" />
        })}
        <circle cx="200" cy="200" r="160" fill="url(#rg)" />
      </svg>
    </div>
  )
}

export default function ParticleNetwork() {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (prefersReduced) return <StaticFallback />

  return (
    <Canvas
      camera={{ position: [0, 0, 12], fov: 55 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.3} />
      <Nodes />
    </Canvas>
  )
}

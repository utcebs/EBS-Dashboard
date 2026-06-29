import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'

// Lazy-loaded by src/App.jsx so the recharts vendor chunk isn't pulled
// in until the user actually opens a project detail page. Mirrors the
// DashboardCharts pattern.
export function DevStatusPie({ data, colors, onDrill }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value"
          label={({ name, value }) => `${name} (${value})`} labelLine={false}
          onClick={(d) => onDrill(d.name)} cursor="pointer">
          {data.map((d, i) => <Cell key={i} fill={colors[d.name]?.hex || '#94a3b8'} />)}
        </Pie>
        <RTooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function UatStatusPie({ data, colors, onDrill }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value"
          label={({ name, value }) => `${name} (${value})`} labelLine={false}
          onClick={(d) => onDrill(d.name)} cursor="pointer">
          {data.map((d, i) => <Cell key={i} fill={colors[d.name]?.hex || '#94a3b8'} />)}
        </Pie>
        <RTooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function RiskBar({ data, fill, onDrill }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <RTooltip />
        <Bar dataKey="value" fill={fill} radius={[6, 6, 0, 0]} barSize={32}
          onClick={(d) => onDrill(d.name)} cursor="pointer" />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default { DevStatusPie, UatStatusPie, RiskBar }

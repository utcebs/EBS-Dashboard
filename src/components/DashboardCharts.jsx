import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts'
import { ChevronRight } from 'lucide-react'

// Lazy-loaded by src/App.jsx so recharts (~80 KB gzipped) only downloads when
// the Dashboard route mounts. Rendered once per `section`:
//   trend          → Project Activity line chart
//   statusPriority → donut + legend with a Status / Priority tab toggle
//   ownerPhase     → ranked owner list / phase bar with a By Owner / By Phase toggle
// Each section returns a single card so App.jsx owns the grid placement.

const AXIS = 'rgba(245,230,194,0.55)'
const GRID = 'rgba(255,255,255,0.06)'
const TOOLTIP = { background: '#15151a', border: '1px solid rgba(212,184,123,0.3)', borderRadius: 12, fontSize: 12, color: '#fff' }
const TOOLTIP_LABEL = { color: 'rgba(245,230,194,0.9)', fontWeight: 600 }

function ChartCard({ accent, title, subtitle, right, children, className = '' }) {
  return (
    <div data-accent={accent} className={`bg-white rounded-2xl p-5 border border-surface-200 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-surface-700">{title}</h3>
          {subtitle && <p className="text-xs text-surface-400 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function TabToggle({ options, value, onChange }) {
  return (
    <div className="dash-tabs shrink-0">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`dash-tab ${value === o.value ? 'is-active' : ''}`}>{o.label}</button>
      ))}
    </div>
  )
}

function DonutWithLegend({ data, colors, onSlice }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex items-center gap-3">
      <div className="dash-donut-wrap shrink-0">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3} dataKey="value"
              onClick={(d) => onSlice(d)} cursor="pointer" stroke="none">
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <RTooltip contentStyle={TOOLTIP} />
          </PieChart>
        </ResponsiveContainer>
        <div className="dash-donut-center">
          <span className="dash-donut-total">{total}</span>
          <span className="dash-donut-label">Total</span>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        {data.map((d, i) => (
          <button key={d.name} type="button" onClick={() => onSlice(d)} className="dash-legend-row">
            <span className="dash-legend-dot" style={{ background: colors[i % colors.length] }} />
            <span className="dash-legend-name">{d.name}</span>
            <span className="dash-legend-val">{d.value}<span className="dash-legend-pct">{total ? Math.round((d.value / total) * 100) : 0}%</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}

function TrendCard({ trendData, className }) {
  return (
    <ChartCard accent="trend" title="Project Activity" subtitle="Started · in progress · completed, by month" className={className}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={trendData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={28} />
          <RTooltip contentStyle={TOOLTIP} labelStyle={TOOLTIP_LABEL} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" />
          <Line type="monotone" dataKey="started" name="Started" stroke="#7dd3fc" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="inProgress" name="In Progress" stroke="#e6cf94" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="completed" name="Completed" stroke="#34d399" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function StatusPriorityCard({ byStatus, byPriority, PIE_COLORS, PRI_PIE_COLORS, onPieClick, className }) {
  const [tab, setTab] = useState('status')
  const isStatus = tab === 'status'
  return (
    <ChartCard accent="status"
      title={isStatus ? 'Status Breakdown' : 'Priority Breakdown'}
      subtitle={isStatus ? 'Click a status to drill in' : 'Click a priority to drill in'}
      className={className}
      right={<TabToggle value={tab} onChange={setTab} options={[{ value: 'status', label: 'Status' }, { value: 'priority', label: 'Priority' }]} />}>
      <DonutWithLegend
        data={isStatus ? byStatus : byPriority}
        colors={isStatus ? PIE_COLORS : PRI_PIE_COLORS}
        onSlice={(d) => onPieClick(d, isStatus ? 'status' : 'priority')} />
    </ChartCard>
  )
}

function OwnerPhaseCard({ ownerData, byPhase, drillOwner, drillPhase, className }) {
  const [tab, setTab] = useState('owner')
  const isOwner = tab === 'owner'
  return (
    <ChartCard accent="phase"
      title={isOwner ? 'Projects by Owner' : 'Projects by Phase'}
      subtitle={isOwner ? 'Click an owner to see projects' : 'Click a bar to see projects'}
      className={className}
      right={<TabToggle value={tab} onChange={setTab} options={[{ value: 'owner', label: 'By Owner' }, { value: 'phase', label: 'By Phase' }]} />}>
      {isOwner ? (
        ownerData.length === 0
          ? <p className="text-sm text-surface-400 py-4">No owners assigned</p>
          : (
            <div className="space-y-1 dash-list-scroll">
              {ownerData.slice(0, 6).map((o, i) => (
                <button key={o.fullName} type="button" onClick={() => drillOwner(o.fullName)}
                  title={`${o.fullName} — ${o.value} project${o.value === 1 ? '' : 's'}`} className="dash-rank-row group">
                  <span className="dash-rank-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="dash-rank-name">{o.fullName}</span>
                  <span className="dash-rank-val">{o.value}</span>
                  <ChevronRight size={14} className="text-surface-300 group-hover:text-brand-400 shrink-0" />
                </button>
              ))}
            </div>
          )
      ) : (
        <ResponsiveContainer width="100%" height={188}>
          <BarChart data={byPhase} margin={{ bottom: 20 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, angle: -20, textAnchor: 'end', fill: AXIS }} axisLine={false} tickLine={false} height={48} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={24} />
            <RTooltip contentStyle={TOOLTIP} labelStyle={TOOLTIP_LABEL} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="value" fill="#e6cf94" radius={[6, 6, 0, 0]} barSize={28}
              onClick={(d) => drillPhase(d.name)} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

export default function DashboardCharts({ section, ...props }) {
  if (section === 'trend') return <TrendCard {...props} />
  if (section === 'statusPriority') return <StatusPriorityCard {...props} />
  if (section === 'ownerPhase') return <OwnerPhaseCard {...props} />
  return null
}

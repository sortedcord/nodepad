"use client"

import * as React from "react"
import * as d3 from "d3"
import { CONTENT_TYPE_CONFIG } from "@/lib/content-types"
import type { TextBlock } from "@/components/tile-card"
import { GraphDetailPanel } from "./graph-detail-panel"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  block?: TextBlock
  isCenter?: boolean
  isSynthesis?: boolean
  synthesisText?: string
  synthesisGenerating?: boolean
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  isSpoke?: boolean
  isSynthesisLink?: boolean
}

interface GraphAreaProps {
  blocks: TextBlock[]
  ghostNote?: { id: string; text: string; category: string; isGenerating: boolean }
  projectName: string
  onReEnrich:       (id: string) => void
  onTogglePin:      (id: string) => void
  onEdit:           (id: string, text: string) => void
  onEditAnnotation: (id: string, annotation: string) => void
  hasApiKey: boolean
  onOpenSidebar: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NODE_R   = 28
const CENTER_R = 40
const SYNTH_R  = 32

function nodeRadius(n: SimNode): number {
  if (n.isCenter)    return CENTER_R
  if (n.isSynthesis) return SYNTH_R
  return NODE_R
}

/**
 * Ring radius grows as more nodes are added — ensures comfortable spacing.
 * Targets ~80 px of arc between adjacent nodes.
 */
function spokeDistance(blockCount: number, scale = 1.0): number {
  const fromSpacing = Math.max(blockCount, 1) * 80 / (2 * Math.PI)
  return Math.max(200, fromSpacing) * scale
}

function buildGraph(
  blocks: TextBlock[],
  ghostNote: GraphAreaProps["ghostNote"],
  cx: number,
  cy: number,
  existing: SimNode[],
): { nodes: SimNode[]; links: SimLink[] } {
  const existMap = new Map(existing.map(n => [n.id, n]))
  const blockIds  = new Set(blocks.map(b => b.id))

  const nodes: SimNode[] = []
  const links: SimLink[] = []
  const edgeSet = new Set<string>()

  // ── Centre: fixed forever ──────────────────────────────────────────────
  const center = existMap.get("__center__") ?? {
    id: "__center__",
    isCenter: true,
    x: cx,
    y: cy,
  } as SimNode
  center.fx = cx
  center.fy = cy
  nodes.push(center)

  // ── Block nodes ────────────────────────────────────────────────────────
  const n    = blocks.length
  const dist = spokeDistance(n)

  blocks.forEach((b, i) => {
    const prev = existMap.get(b.id)
    if (prev) {
      prev.block = b
      nodes.push(prev)
    } else {
      // Seed new nodes evenly on the ring
      const angle = (2 * Math.PI * i / Math.max(n, 1)) - Math.PI / 2
      nodes.push({
        id: b.id,
        block: b,
        x: cx + dist * Math.cos(angle),
        y: cy + dist * Math.sin(angle),
      })
    }
  })

  // ── Synthesis node ─────────────────────────────────────────────────────
  if (ghostNote) {
    const prev = existMap.get(ghostNote.id)
    if (prev) {
      prev.synthesisText      = ghostNote.text
      prev.synthesisGenerating = ghostNote.isGenerating
      nodes.push(prev)
    } else {
      nodes.push({
        id: ghostNote.id,
        isSynthesis: true,
        synthesisText: ghostNote.text,
        synthesisGenerating: ghostNote.isGenerating,
        x: cx + (Math.random() - 0.5) * 60,
        y: cy - dist * 0.85,
      })
    }
  }

  // ── Links ──────────────────────────────────────────────────────────────
  // Spokes: centre → every node
  for (const node of nodes) {
    if (node.isCenter) continue
    links.push({ source: "__center__", target: node.id, isSpoke: true })
  }

  // Chords: influencedBy
  for (const b of blocks) {
    if (!b.influencedBy?.length) continue
    for (const tid of b.influencedBy) {
      if (!blockIds.has(tid)) continue
      const key = [b.id, tid].sort().join("§")
      if (edgeSet.has(key)) continue
      edgeSet.add(key)
      links.push({ source: b.id, target: tid })
    }
  }

  // Synthesis links (dashed, soft)
  if (ghostNote) {
    for (const b of blocks) {
      links.push({ source: ghostNote.id, target: b.id, isSynthesisLink: true })
    }
  }

  return { nodes, links }
}

/** Quadratic bezier curving slightly away from the canvas centre */
function chordPath(sx: number, sy: number, tx: number, ty: number, cx: number, cy: number): string {
  const mx = (sx + tx) / 2
  const my = (sy + ty) / 2
  const dx = mx - cx
  const dy = my - cy
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return `M ${sx} ${sy} L ${tx} ${ty}`
  const f = Math.min(45, dist * 0.1) / dist
  return `M ${sx} ${sy} Q ${mx + dx * f} ${my + dy * f} ${tx} ${ty}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GraphArea({
  blocks,
  ghostNote,
  projectName,
  onReEnrich,
  onTogglePin,
  onEdit,
  onEditAnnotation,
}: GraphAreaProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const svgRef       = React.useRef<SVGSVGElement>(null)
  const simRef       = React.useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const nodesRef     = React.useRef<SimNode[]>([])
  const linksRef     = React.useRef<SimLink[]>([])
  const dimsRef      = React.useRef({ w: 900, h: 600 })

  const [, forceUpdate]   = React.useReducer(x => x + 1, 0)
  const [dims, setDims]   = React.useState({ w: 900, h: 600 })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [hoveredId,  setHoveredId]  = React.useState<string | null>(null)
  const [tooltip,    setTooltip]    = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [transform,  setTransform]  = React.useState({ x: 0, y: 0, k: 1 })

  const isPanning   = React.useRef(false)
  const panStart    = React.useRef({ mx: 0, my: 0, tx: 0, ty: 0 })
  const draggedNode = React.useRef<SimNode | null>(null)

  // ── Measure container ────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      dimsRef.current = { w: width, h: height }
      setDims({ w: width, h: height })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Keep dimsRef in sync
  React.useEffect(() => { dimsRef.current = dims }, [dims])

  // ── Init simulation once ─────────────────────────────────────────────────
  React.useEffect(() => {
    const { w, h } = dimsRef.current
    simRef.current = d3
      .forceSimulation<SimNode>([])
      .force(
        "link",
        d3.forceLink<SimNode, SimLink>([])
          .id(d => d.id)
          .distance(l => {
            if ((l as SimLink).isSpoke)         return spokeDistance(nodesRef.current.filter(n => !n.isCenter && !n.isSynthesis).length)
            if ((l as SimLink).isSynthesisLink) return spokeDistance(nodesRef.current.filter(n => !n.isCenter && !n.isSynthesis).length) * 0.8
            return 130
          })
          .strength(l => {
            if ((l as SimLink).isSpoke)         return 0.12
            if ((l as SimLink).isSynthesisLink) return 0.03
            return 0.28
          }),
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(n => n.isCenter ? 0 : (n.isSynthesis ? -600 : -380)))
      .force("collide", d3.forceCollide<SimNode>().radius(n => nodeRadius(n) + 32).strength(0.85))
      .alphaDecay(0.013)
      .velocityDecay(0.38)
      .on("tick", () => forceUpdate())
      .stop()
    return () => { simRef.current?.stop() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update graph when blocks/ghostNote change ────────────────────────────
  React.useEffect(() => {
    const sim = simRef.current
    if (!sim) return
    const { w, h } = dimsRef.current
    const cx = w / 2
    const cy = h / 2
    const prevBlockCount = nodesRef.current.filter(n => !n.isCenter && !n.isSynthesis).length

    const { nodes, links } = buildGraph(blocks, ghostNote, cx, cy, nodesRef.current)

    // Ensure centre is always fixed
    for (const n of nodes) {
      if (n.isCenter) { n.fx = cx; n.fy = cy }
    }

    nodesRef.current = nodes
    linksRef.current = links

    sim.nodes(nodesRef.current)
    ;(sim.force("link") as d3.ForceLink<SimNode, SimLink>).links(linksRef.current)

    const isNewNode = blocks.length > prevBlockCount
    sim.alpha(isNewNode ? 0.4 : 0.18).restart()
  }, [blocks, ghostNote]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recentre when container resizes ─────────────────────────────────────
  React.useEffect(() => {
    const sim = simRef.current
    if (!sim) return
    const cx = dims.w / 2
    const cy = dims.h / 2
    const center = nodesRef.current.find(n => n.isCenter)
    if (center) { center.fx = cx; center.fy = cy; center.x = cx; center.y = cy }
    sim.alpha(0.1).restart()
  }, [dims])

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const rect   = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setTransform(t => {
      const k = Math.max(0.2, Math.min(4, t.k * factor))
      return { x: mx - (mx - t.x) * (k / t.k), y: my - (my - t.y) * (k / t.k), k }
    })
  }, [])

  // ── Pan ──────────────────────────────────────────────────────────────────
  const handleSvgMouseDown = React.useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest(".graph-node")) return
    isPanning.current = true
    panStart.current  = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y }
  }, [transform])

  const handleSvgMouseMove = React.useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedNode.current && simRef.current) {
      const rect = svgRef.current!.getBoundingClientRect()
      const wx   = (e.clientX - rect.left  - transform.x) / transform.k
      const wy   = (e.clientY - rect.top   - transform.y) / transform.k
      draggedNode.current.fx = wx
      draggedNode.current.fy = wy
      simRef.current.alphaTarget(0.3).restart()
      return
    }
    if (!isPanning.current) return
    setTransform(t => ({
      ...t,
      x: panStart.current.tx + (e.clientX - panStart.current.mx),
      y: panStart.current.ty + (e.clientY - panStart.current.my),
    }))
  }, [transform])

  const handleSvgMouseUp = React.useCallback(() => {
    isPanning.current = false
    if (draggedNode.current && simRef.current) {
      if (!draggedNode.current.isCenter) {
        draggedNode.current.fx = null
        draggedNode.current.fy = null
      }
      simRef.current.alphaTarget(0)
      draggedNode.current = null
    }
  }, [])

  // ── Node drag ────────────────────────────────────────────────────────────
  const handleNodeMouseDown = React.useCallback((e: React.MouseEvent, node: SimNode) => {
    if (node.isCenter) return
    e.stopPropagation()
    draggedNode.current = node
    simRef.current?.alphaTarget(0.3).restart()
  }, [])

  // ── Connected IDs for hover dimming ─────────────────────────────────────
  const connectedToHovered = React.useMemo(() => {
    if (!hoveredId) return null
    const ids = new Set<string>([hoveredId, "__center__"])
    if (nodesRef.current.find(n => n.id === hoveredId)?.isSynthesis) {
      for (const n of nodesRef.current) ids.add(n.id)
    } else {
      const b = blocks.find(x => x.id === hoveredId)
      if (b?.influencedBy) for (const id of b.influencedBy) ids.add(id)
      for (const x of blocks) {
        if (x.influencedBy?.includes(hoveredId)) ids.add(x.id)
      }
    }
    return ids
  }, [hoveredId, blocks])

  const selectedBlock = React.useMemo(
    () => blocks.find(b => b.id === selectedId) ?? null,
    [blocks, selectedId],
  )

  const { x: tx, y: ty, k: tk } = transform
  const cx = dims.w / 2
  const cy = dims.h / 2

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">

      {/* Graph canvas */}
      <div
        ref={containerRef}
        style={{ width: selectedId ? "70%" : "100%" }}
        className="relative h-full transition-all duration-300 overflow-hidden"
      >
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/30">
              no nodes yet — add notes to see the graph
            </p>
          </div>
        )}

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="select-none"
          style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
          onWheel={handleWheel}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          onClick={() => setSelectedId(null)}
        >
          <defs>
            <filter id="glow-synthesis" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="synthesis-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="var(--type-thesis)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--type-claim)"  stopOpacity="0.8" />
            </radialGradient>
          </defs>

          <g transform={`translate(${tx},${ty}) scale(${tk})`}>

            {/* ── Edges ──────────────────────────────────────────────────── */}
            <g>
              {linksRef.current.map((link, i) => {
                const s = link.source as SimNode
                const t = link.target as SimNode
                if (s.x == null || t.x == null) return null

                const isSpoke = (link as SimLink).isSpoke
                const isSynth = (link as SimLink).isSynthesisLink

                const dimmed = hoveredId != null &&
                  s.id !== hoveredId && t.id !== hoveredId

                const highlighted = hoveredId != null && !dimmed && !isSpoke

                const d = isSpoke
                  ? `M ${s.x} ${s.y} L ${t.x} ${t.y}`
                  : chordPath(s.x, s.y, t.x, t.y, cx, cy)

                return (
                  <path
                    key={i}
                    d={d}
                    stroke="white"
                    strokeWidth={isSpoke ? 0.7 : isSynth ? 0.6 : 1.5}
                    strokeDasharray={isSynth ? "4 6" : undefined}
                    strokeOpacity={
                      dimmed      ? 0.02 :
                      highlighted ? 0.75 :
                      isSpoke     ? (hoveredId === t.id ? 0.4 : 0.09) :
                      isSynth     ? 0.06 :
                      0.28
                    }
                    fill="none"
                    style={{ transition: "stroke-opacity 0.15s" }}
                  />
                )
              })}
            </g>

            {/* ── Nodes ──────────────────────────────────────────────────── */}
            <g>
              {nodesRef.current.map(node => {
                if (node.x == null || node.y == null) return null

                const isSelected  = node.id === selectedId
                const isHovered   = node.id === hoveredId
                const isDimmed    = hoveredId != null && !node.isCenter && !isHovered &&
                  (!connectedToHovered || !connectedToHovered.has(node.id))
                const isEnriching = node.block?.isEnriching

                const r      = nodeRadius(node)
                const config = node.block ? CONTENT_TYPE_CONFIG[node.block.contentType] : null
                const Icon   = config?.icon ?? null
                const accent = config?.accentVar ?? "var(--type-thesis)"

                let fill = "transparent"
                if (node.isCenter)    fill = "rgba(255,255,255,0.04)"
                else if (node.isSynthesis) fill = "url(#synthesis-gradient)"
                else if (config)      fill = config.accentVar

                return (
                  <g
                    key={node.id}
                    className="graph-node"
                    transform={`translate(${node.x},${node.y})`}
                    style={{
                      opacity:  isDimmed ? 0.1 : 1,
                      filter:   node.isSynthesis ? "url(#glow-synthesis)" : undefined,
                      cursor:   node.isCenter ? "default" : "pointer",
                      transition: "opacity 0.2s",
                    }}
                    onMouseDown={e => handleNodeMouseDown(e, node)}
                    onClick={e => {
                      e.stopPropagation()
                      if (!node.isCenter) setSelectedId(prev => prev === node.id ? null : node.id)
                    }}
                    onMouseEnter={e => {
                      if (!node.isCenter) setHoveredId(node.id)
                      const rect = svgRef.current!.getBoundingClientRect()
                      setTooltip({ id: node.id, x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }}
                    onMouseMove={e => {
                      const rect = svgRef.current!.getBoundingClientRect()
                      setTooltip({ id: node.id, x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }}
                    onMouseLeave={() => { setHoveredId(null); setTooltip(null) }}
                  >
                    {/* Centre: decorative ring */}
                    {node.isCenter && (
                      <circle r={CENTER_R + 10} fill="none" stroke="white" strokeWidth={0.5} strokeOpacity={0.07} />
                    )}

                    {/* Selected / hovered ring */}
                    {(isSelected || isHovered) && !node.isCenter && (
                      <circle
                        r={r + 9}
                        fill="none"
                        stroke={accent}
                        strokeWidth={isSelected ? 1.5 : 1}
                        strokeOpacity={isSelected ? 0.65 : 0.3}
                      />
                    )}

                    {/* Enriching ring — transformBox:fill-box fixes rotation around element centre */}
                    {isEnriching && (
                      <circle
                        r={r + 13}
                        fill="none"
                        stroke={accent}
                        strokeWidth={1.2}
                        strokeDasharray="5 4"
                        strokeOpacity={0.55}
                        style={{
                          transformBox: "fill-box" as React.CSSProperties["transformBox"],
                          transformOrigin: "center",
                          animation: "spin 2.5s linear infinite",
                        }}
                      />
                    )}

                    {/* Synthesis halo */}
                    {node.isSynthesis && (
                      <>
                        <circle r={r + 15} fill="none" stroke="var(--type-thesis)" strokeWidth={0.5} strokeOpacity={0.14} />
                        <circle r={r + 28} fill="none" stroke="var(--type-thesis)" strokeWidth={0.5} strokeOpacity={0.06} />
                      </>
                    )}

                    {/* Main circle */}
                    <circle
                      r={r}
                      fill={fill}
                      fillOpacity={
                        node.isCenter    ? 1 :
                        node.isSynthesis ? 1 :
                        isSelected       ? 1.0 :
                        isHovered        ? 0.96 : 0.90
                      }
                      stroke={
                        node.isCenter ? "rgba(255,255,255,0.13)" :
                        isSelected    ? accent : "none"
                      }
                      strokeWidth={node.isCenter ? 1 : isSelected ? 1.5 : 0}
                    />

                    {/* Block icon */}
                    {Icon && (
                      <foreignObject x={-14} y={-14} width={28} height={28} style={{ pointerEvents: "none" }}>
                        <div
                          // @ts-ignore
                          xmlns="http://www.w3.org/1999/xhtml"
                          style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <Icon style={{ width: 15, height: 15, color: "white", opacity: 0.92 }} />
                        </div>
                      </foreignObject>
                    )}

                    {/* Centre: project name below circle */}
                    {node.isCenter && (
                      <text
                        y={CENTER_R + 17}
                        textAnchor="middle"
                        fontSize={10}
                        fontFamily="monospace"
                        fill="white"
                        fillOpacity={0.32}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {projectName.length > 18 ? projectName.slice(0, 18) + "…" : projectName}
                      </text>
                    )}

                    {/* Synthesis glyph */}
                    {node.isSynthesis && (
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={13}
                        fill="white"
                        fillOpacity={0.9}
                        style={{ pointerEvents: "none" }}
                      >
                        ✦
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </g>
        </svg>

        {/* ── Floating tooltip ──────────────────────────────────────────── */}
        {tooltip && (() => {
          const node = nodesRef.current.find(n => n.id === tooltip.id)
          if (!node || node.isCenter) return null
          const label = node.isSynthesis
            ? (node.synthesisText ?? "Synthesis")
            : (node.block?.text ?? "")
          const config = node.block ? CONTENT_TYPE_CONFIG[node.block.contentType] : null
          const accent = config?.accentVar ?? "var(--type-thesis)"
          const tipX = Math.min(tooltip.x + 12, (selectedId ? dims.w * 0.7 : dims.w) - 296)
          const tipY = tooltip.y - 16
          return (
            <div
              className="absolute z-50 pointer-events-none"
              style={{ left: tipX, top: tipY, transform: "translateY(-100%)" }}
            >
              <div
                className="rounded-sm shadow-[0_4px_24px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden"
                style={{ minWidth: 180, maxWidth: 290 }}
              >
                <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: accent }}>
                  {config?.icon && React.createElement(config.icon, {
                    className: "h-3 w-3 flex-shrink-0",
                    style: { color: "black", opacity: 0.7 },
                  })}
                  <span className="font-mono text-[9px] font-black uppercase tracking-widest text-black/70">
                    {node.isSynthesis ? "Synthesis" : config?.label}
                  </span>
                  {node.block?.category && (
                    <span className="ml-auto font-mono text-[8px] text-black/50 truncate max-w-[90px]">
                      {node.block.category}
                    </span>
                  )}
                </div>
                <div className="bg-card/95 backdrop-blur-sm px-3 py-2.5">
                  <p className="text-sm font-semibold leading-snug text-foreground">{label}</p>
                </div>
              </div>
              <div
                className="mx-4 h-2 w-2 rotate-45 border-b border-r border-white/10 bg-card/95"
                style={{ marginTop: -1 }}
              />
            </div>
          )
        })()}

        {/* Hints */}
        <div className="absolute bottom-4 left-4 pointer-events-none">
          <span className="font-mono text-[8px] text-muted-foreground/25 uppercase tracking-widest">
            scroll to zoom · drag to pan · drag node to reposition
          </span>
        </div>

        {blocks.length > 0 && (
          <div className="absolute top-4 left-4 pointer-events-none">
            <span className="font-mono text-[8px] text-muted-foreground/25 uppercase tracking-widest">
              {blocks.length} node{blocks.length !== 1 ? "s" : ""}
              {ghostNote ? " · synthesis active" : ""}
            </span>
          </div>
        )}

      </div>

      {/* ── Detail panel (30%) ─────────────────────────────────────────────── */}
      {selectedId && (
        <div className="h-full overflow-hidden transition-all duration-300" style={{ width: "30%" }}>
          <GraphDetailPanel
            block={selectedBlock}
            allBlocks={blocks}
            onClose={() => setSelectedId(null)}
            onSelectNode={id => setSelectedId(id)}
            onReEnrich={onReEnrich}
            onTogglePin={onTogglePin}
            onEdit={onEdit}
            onEditAnnotation={onEditAnnotation}
          />
        </div>
      )}
    </div>
  )
}

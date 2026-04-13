/* global d3 */
'use strict';

/**
 * graph.js — D3 force-directed graph for the 公论 non-linear structure.
 *
 * Exports:
 *   initGraph(container)   → GraphController
 *
 * GraphController API:
 *   .update(graphData)     — re-render with { nodes, edges }
 *   .onNodeClick(fn)       — register click handler fn(node)
 */

const GRAPH_CONFIG = {
  nodeRadius:   22,
  linkDistance: 140,
  chargeStrength: -400,
  collideRadius: 32,   // nodeRadius + 10
};

const NODE_COLORS = {
  message:  '#6c8cff',
  question: '#fbbf24',
  relation: '#a78bfa',
  summary:  '#34d399',
};
const EDGE_COLORS = {
  agrees:      '#4ade80',
  disagrees:   '#f87171',
  contradicts: '#f87171',
  elaborates:  '#6c8cff',
  summarizes:  '#34d399',
  references:  '#4a5270',
};

function initGraph(containerSelector) {
  const container = document.querySelector(containerSelector);
  const svg       = d3.select('#graph-svg');

  let width  = container.clientWidth;
  let height = container.clientHeight;

  svg.attr('viewBox', `0 0 ${width} ${height}`);

  // Zoom layer
  const zoomLayer = svg.append('g').attr('class', 'zoom-layer');

  svg.call(
    d3.zoom()
      .scaleExtent([0.15, 4])
      .on('zoom', e => zoomLayer.attr('transform', e.transform))
  );

  // Arrow marker definitions
  const defs = svg.append('defs');
  const markerTypes = ['references', 'agrees', 'disagrees', 'contradicts', 'elaborates', 'summarizes'];
  for (const t of markerTypes) {
    defs.append('marker')
      .attr('id',          `arrow-${t}`)
      .attr('viewBox',     '0 -5 10 10')
      .attr('refX',        GRAPH_CONFIG.nodeRadius + 10)
      .attr('refY',        0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient',      'auto')
      .append('path')
        .attr('d',    'M0,-5L10,0L0,5')
        .attr('fill', EDGE_COLORS[t] || EDGE_COLORS.references);
  }

  // Containers for edges, then nodes (nodes on top)
  const edgeLayer = zoomLayer.append('g').attr('class', 'edges');
  const nodeLayer = zoomLayer.append('g').attr('class', 'nodes');

  // Simulation
  const simulation = d3.forceSimulation()
    .force('link',   d3.forceLink().id(d => d.id).distance(GRAPH_CONFIG.linkDistance))
    .force('charge', d3.forceManyBody().strength(GRAPH_CONFIG.chargeStrength))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(GRAPH_CONFIG.collideRadius));

  let clickHandler = () => {};
  let currentNodes = [];
  let currentEdges = [];

  // Tick
  function tick() {
    edgeLayer.selectAll('line')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    nodeLayer.selectAll('.node')
      .attr('transform', d => `translate(${d.x},${d.y})`);
  }

  // Update the graph
  function update({ nodes, edges }) {
    width  = container.clientWidth;
    height = container.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    simulation.force('center', d3.forceCenter(width / 2, height / 2));

    // Preserve positions of existing nodes
    const oldPositions = {};
    for (const n of currentNodes) {
      oldPositions[n.id] = { x: n.x, y: n.y, vx: n.vx, vy: n.vy };
    }

    currentNodes = nodes.map(n => {
      const old = oldPositions[n.id];
      return old ? { ...n, x: old.x, y: old.y, vx: old.vx, vy: old.vy } : n;
    });
    currentEdges = edges;

    // -- Edges --
    const link = edgeLayer.selectAll('line').data(currentEdges, d => d.id);

    link.exit().remove();

    link.enter().append('line')
      .attr('class', 'link')
      .merge(link)
      .attr('stroke', d => EDGE_COLORS[d.type] || EDGE_COLORS.references)
      .attr('stroke-width', d => d.type === 'references' ? 1.5 : 2.5)
      .attr('stroke-dasharray', d => d.type === 'references' ? '4 3' : null)
      .attr('marker-end', d => `url(#arrow-${d.type || 'references'})`);

    // -- Nodes --
    const node = nodeLayer.selectAll('.node').data(currentNodes, d => d.id);

    node.exit().remove();

    const nodeEnter = node.enter().append('g')
      .attr('class', 'node')
      .call(
        d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end',   (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        clickHandler(d);
        // Highlight
        nodeLayer.selectAll('.node circle').attr('stroke', '#fff').attr('stroke-width', 2);
        d3.select(event.currentTarget).select('circle')
          .attr('stroke', '#fff').attr('stroke-width', 3.5);
      });

    nodeEnter.append('circle')
      .attr('r', GRAPH_CONFIG.nodeRadius)
      .attr('fill', d => NODE_COLORS[d.type] || NODE_COLORS.message)
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Type icon
    nodeEnter.append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('y', -4)
      .attr('font-size', 14)
      .text(d => nodeIcon(d.type));

    // Short label below icon
    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('y', 10)
      .attr('font-size', 9)
      .attr('fill', '#fff')
      .text(d => d.label.slice(0, 12));

    // Tooltip via title
    nodeEnter.append('title').text(d => d.label);

    // Merge & update fill (in case type changed)
    nodeLayer.selectAll('.node circle')
      .data(currentNodes, d => d.id)
      .attr('fill', d => NODE_COLORS[d.type] || NODE_COLORS.message);

    // Update simulation
    simulation.nodes(currentNodes).on('tick', tick);
    simulation.force('link').links(currentEdges);
    simulation.alpha(0.3).restart();
  }

  function nodeIcon(type) {
    return { message: '💬', question: '❓', relation: '🔗', summary: '📋' }[type] || '💬';
  }

  // Click on empty space → deselect
  svg.on('click', () => {
    nodeLayer.selectAll('.node circle').attr('stroke', '#fff').attr('stroke-width', 2);
  });

  // Resize
  window.addEventListener('resize', () => {
    width  = container.clientWidth;
    height = container.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    simulation.force('center', d3.forceCenter(width / 2, height / 2));
    simulation.alpha(0.1).restart();
  });

  return {
    update,
    onNodeClick(fn) { clickHandler = fn; },
  };
}

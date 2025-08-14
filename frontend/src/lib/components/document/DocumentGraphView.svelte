<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { Network } from 'lucide-svelte';
	import type { Document, WikiLink, GraphData, GraphNode, GraphLink } from '$lib/api/types';
	import { goto } from '$app/navigation';

	interface Props {
		currentDocument: Document;
		backlinks: Document[];
		outgoingLinks: WikiLink[];
	}

	const { currentDocument, backlinks, outgoingLinks }: Props = $props();

	let svgElement = $state<SVGSVGElement>();
	let containerElement = $state<HTMLDivElement>();
	let width = $state(800);
	let height = $state(600);
	let isInitialized = $state(false);

	function createGraphData(): GraphData {
		const nodes: GraphNode[] = [];
		const links: GraphLink[] = [];

		// Add current document as central node
		nodes.push({
			id: currentDocument.metaData.path,
			title: currentDocument.metaData.title,
			path: currentDocument.metaData.path,
			type: 'current'
		});

		// Add backlink nodes and links
		(backlinks || []).forEach((doc) => {
			nodes.push({
				id: doc.metaData.path,
				title: doc.metaData.title,
				path: doc.metaData.path,
				type: 'backlink'
			});

			links.push({
				source: doc.metaData.path,
				target: currentDocument.metaData.path,
				type: 'backlink'
			});
		});

		// Add outgoing link nodes and links
		(outgoingLinks || []).forEach((link) => {
			// Only add valid links that don't already exist
			if (link.is_valid && !nodes.find((n) => n.id === link.path)) {
				nodes.push({
					id: link.path,
					title: link.display_text,
					path: link.path,
					type: 'outgoing'
				});
			}

			if (link.is_valid) {
				links.push({
					source: currentDocument.metaData.path,
					target: link.path,
					type: 'outgoing'
				});
			}
		});

		return { nodes, links };
	}

	function initializeGraph() {
		if (!svgElement || !containerElement) return;

		const graphData = createGraphData();
		
		// Set initial state
		isInitialized = false;

		// Wait for next tick to ensure the container is properly rendered
		setTimeout(() => {
			if (!containerElement) return;
			
			const rect = containerElement.getBoundingClientRect();
			width = Math.max(400, rect.width || 800);
			height = Math.max(300, Math.min(600, rect.height || 400));

			renderGraph(graphData);
		}, 0);
	}

	function renderGraph(graphData: GraphData) {
		if (!svgElement) return;

		// Clear existing content
		d3.select(svgElement).selectAll('*').remove();

		const svg = d3.select(svgElement).attr('width', width).attr('height', height);

		// Create a container group for zooming
		const container = svg.append('g');

		// Define zoom behavior
		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 4])
			.on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
				container.attr('transform', event.transform.toString());
			});

		svg.call(zoom);

		// Create force simulation
		const simulation = d3
			.forceSimulation<GraphNode>(graphData.nodes)
			.force(
				'link',
				d3
					.forceLink<GraphNode, GraphLink>(graphData.links)
					.id((d: GraphNode) => d.id)
					.distance(100)
			)
			.force('charge', d3.forceManyBody().strength(-300))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(30));

		// Create links
		const link = container
			.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data(graphData.links)
			.enter()
			.append('line')
			.attr('class', 'graph-link')
			.attr('stroke', (d: GraphLink) => (d.type === 'backlink' ? '#10b981' : '#3b82f6'))
			.attr('stroke-width', 2)
			.attr('stroke-opacity', 0.6);

		// Create node groups
		const node = container
			.append('g')
			.attr('class', 'nodes')
			.selectAll('g')
			.data(graphData.nodes)
			.enter()
			.append('g')
			.attr('class', 'graph-node')
			.style('cursor', 'pointer');

		// Add circles to nodes
		node
			.append('circle')
			.attr('r', (d: GraphNode) => (d.type === 'current' ? 25 : 20))
			.attr('fill', (d: GraphNode) => {
				switch (d.type) {
					case 'current':
						return '#ef4444';
					case 'backlink':
						return '#10b981';
					case 'outgoing':
						return '#3b82f6';
					default:
						return '#6b7280';
				}
			})
			.attr('stroke', '#fff')
			.attr('stroke-width', 2);

		// Add labels to nodes
		node
			.append('text')
			.text((d: GraphNode) => d.title)
			.attr('dy', -30)
			.attr('text-anchor', 'middle')
			.attr('font-size', '12px')
			.attr('fill', 'currentColor')
			.style('pointer-events', 'none');

		// Add drag behavior
		const drag = d3
			.drag<SVGGElement, GraphNode>()
			.on('start', (event: d3.D3DragEvent<SVGGElement, GraphNode, never>, d: GraphNode) => {
				if (!event.active) simulation.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
			})
			.on('drag', (event: d3.D3DragEvent<SVGGElement, GraphNode, never>, d: GraphNode) => {
				d.fx = event.x;
				d.fy = event.y;
			})
			.on('end', (event: d3.D3DragEvent<SVGGElement, GraphNode, never>, d: GraphNode) => {
				if (!event.active) simulation.alphaTarget(0);
				d.fx = null;
				d.fy = null;
			});

		node.call(drag);

		// Add click behavior
		node.on('click', (event: MouseEvent, d: GraphNode) => {
			event.stopPropagation();
			if (d.path !== currentDocument.metaData.path) {
				goto(`/documents${d.path}`);
			}
		});

		// Update positions on simulation tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d: d3.SimulationLinkDatum<GraphNode>) => (d.source as GraphNode).x || 0)
				.attr('y1', (d: d3.SimulationLinkDatum<GraphNode>) => (d.source as GraphNode).y || 0)
				.attr('x2', (d: d3.SimulationLinkDatum<GraphNode>) => (d.target as GraphNode).x || 0)
				.attr('y2', (d: d3.SimulationLinkDatum<GraphNode>) => (d.target as GraphNode).y || 0);

			node.attr('transform', (d: GraphNode) => `translate(${d.x || 0},${d.y || 0})`);
		});

		// Center on current document
		const currentNode = graphData.nodes.find((n) => n.type === 'current');
		if (currentNode && currentNode.x && currentNode.y) {
			const scale = 1;
			const transform = d3.zoomIdentity
				.translate(width / 2 - currentNode.x * scale, height / 2 - currentNode.y * scale)
				.scale(scale);

			svg.transition().duration(1000).call(zoom.transform, transform);
		}

		isInitialized = true;
	}

	function handleResize() {
		if (containerElement && isInitialized) {
			const rect = containerElement.getBoundingClientRect();
			const newWidth = Math.max(400, rect.width);
			const newHeight = Math.max(300, Math.min(600, rect.height));

			if (newWidth !== width || newHeight !== height) {
				width = newWidth;
				height = newHeight;
				initializeGraph();
			}
		}
	}

	onMount(() => {
		const resizeObserver = new ResizeObserver(handleResize);
		if (containerElement) {
			resizeObserver.observe(containerElement);
		}

		return () => {
			resizeObserver.disconnect();
		};
	});

	$effect(() => {
		if (svgElement && containerElement && (backlinks || outgoingLinks)) {
			initializeGraph();
		}
	});
</script>

<div
	bind:this={containerElement}
	class="border-border bg-background relative h-full min-h-[400px] w-full overflow-hidden rounded-lg border"
>
	{#if (backlinks?.length || 0) === 0 && ((outgoingLinks?.filter((l) => l.is_valid) || []).length === 0)}
		<div class="flex h-full min-h-[400px] items-center justify-center">
			<div class="py-8 text-center">
				<div class="text-muted-foreground mb-2">
					<Network class="mx-auto h-12 w-12" />
				</div>
				<p class="text-muted-foreground text-sm">No links found</p>
				<p class="text-muted-foreground text-xs">
					Create [[wiki links]] to other documents to see connections
				</p>
			</div>
		</div>
	{:else}
		<div class="relative h-full w-full">
			<svg 
				bind:this={svgElement} 
				class="h-full w-full transition-opacity duration-300" 
				class:opacity-0={!isInitialized}
			></svg>
			
			{#if !isInitialized}
				<div class="absolute inset-0 flex items-center justify-center">
					<div class="text-muted-foreground text-sm">Initializing graph...</div>
				</div>
			{/if}
		</div>

		<div
			class="bg-card border-border absolute top-4 right-4 rounded-md border p-3 text-xs shadow-sm"
		>
			<div class="mb-1 flex items-center gap-2">
				<div
					class="h-3 w-3 rounded-full border border-white"
					style="background-color: #ef4444;"
				></div>
				<span class="text-muted-foreground">Current Document</span>
			</div>
			<div class="mb-1 flex items-center gap-2">
				<div
					class="h-3 w-3 rounded-full border border-white"
					style="background-color: #10b981;"
				></div>
				<span class="text-muted-foreground">Backlinks ({backlinks?.length || 0})</span>
			</div>
			<div class="flex items-center gap-2">
				<div
					class="h-3 w-3 rounded-full border border-white"
					style="background-color: #3b82f6;"
				></div>
				<span class="text-muted-foreground"
					>Outgoing Links ({(outgoingLinks?.filter((l) => l.is_valid) || []).length})</span
				>
			</div>
		</div>
	{/if}
</div>

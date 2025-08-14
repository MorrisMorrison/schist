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
		backlinks.forEach((doc) => {
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
		outgoingLinks.forEach((link) => {
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
		if (!svgElement) return;

		const graphData = createGraphData();

		// Clear existing content
		d3.select(svgElement).selectAll('*').remove();

		const svg = d3.select(svgElement).attr('width', width).attr('height', height);

		// Create a container group for zooming
		const container = svg.append('g');

		// Define zoom behavior
		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 4])
			.on('zoom', (event) => {
				container.attr('transform', event.transform);
			});

		svg.call(zoom);

		// Create force simulation
		const simulation = d3
			.forceSimulation<GraphNode>(graphData.nodes)
			.force(
				'link',
				d3
					.forceLink<GraphNode, GraphLink>(graphData.links)
					.id((d) => d.id)
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
			.attr('stroke', (d) => (d.type === 'backlink' ? '#10b981' : '#3b82f6'))
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
			.attr('r', (d: any) => (d.type === 'current' ? 25 : 20))
			.attr('fill', (d: any) => {
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
			.text((d: any) => d.title)
			.attr('dy', -30)
			.attr('text-anchor', 'middle')
			.attr('font-size', '12px')
			.attr('fill', 'currentColor')
			.style('pointer-events', 'none');

		// Add drag behavior
		const drag = d3
			.drag<SVGGElement, GraphNode>()
			.on('start', (event: any, d: any) => {
				if (!event.active) simulation.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
			})
			.on('drag', (event: any, d: any) => {
				d.fx = event.x;
				d.fy = event.y;
			})
			.on('end', (event: any, d: any) => {
				if (!event.active) simulation.alphaTarget(0);
				d.fx = null;
				d.fy = null;
			});

		node.call(drag);

		// Add click behavior
		node.on('click', (event: any, d: any) => {
			event.stopPropagation();
			if (d.path !== currentDocument.metaData.path) {
				goto(`/documents${d.path}`);
			}
		});

		// Update positions on simulation tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
		});

		// Center on current document
		const currentNode = graphData.nodes.find((n) => n.type === 'current');
		if (currentNode && (currentNode as any).x && (currentNode as any).y) {
			const scale = 1;
			const transform = d3.zoomIdentity
				.translate(width / 2 - (currentNode as any).x * scale, height / 2 - (currentNode as any).y * scale)
				.scale(scale);
			
			svg.transition().duration(1000).call(zoom.transform as any, transform);
		}
	}

	function handleResize() {
		if (containerElement) {
			const rect = containerElement.getBoundingClientRect();
			width = Math.max(400, rect.width);
			height = Math.max(300, Math.min(600, rect.height));
			
			if (svgElement) {
				initializeGraph();
			}
		}
	}

	onMount(() => {
		handleResize();
		initializeGraph();

		const resizeObserver = new ResizeObserver(handleResize);
		if (containerElement) {
			resizeObserver.observe(containerElement);
		}

		return () => {
			resizeObserver.disconnect();
		};
	});

	$effect(() => {
		if (svgElement && (backlinks || outgoingLinks)) {
			initializeGraph();
		}
	});
</script>

<div bind:this={containerElement} class="relative w-full h-full min-h-[400px] border border-border rounded-lg bg-background overflow-hidden">
	{#if backlinks.length === 0 && outgoingLinks.length === 0}
		<div class="flex items-center justify-center h-full min-h-[400px]">
			<div class="text-center py-8">
				<div class="text-muted-foreground mb-2">
					<Network class="mx-auto h-12 w-12" />
				</div>
				<p class="text-muted-foreground text-sm">No connections found</p>
				<p class="text-muted-foreground text-xs">
					Create [[wiki links]] to other documents to build your knowledge graph
				</p>
			</div>
		</div>
	{:else}
		<svg bind:this={svgElement} class="w-full h-full"></svg>
		
		<div class="absolute top-4 right-4 bg-card border border-border rounded-md p-3 text-xs shadow-sm">
			<div class="flex items-center gap-2 mb-1">
				<div class="w-3 h-3 rounded-full border border-white" style="background-color: #ef4444;"></div>
				<span class="text-muted-foreground">Current Document</span>
			</div>
			<div class="flex items-center gap-2 mb-1">
				<div class="w-3 h-3 rounded-full border border-white" style="background-color: #10b981;"></div>
				<span class="text-muted-foreground">Backlinks ({backlinks.length})</span>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-3 h-3 rounded-full border border-white" style="background-color: #3b82f6;"></div>
				<span class="text-muted-foreground">Outgoing Links ({outgoingLinks.filter(l => l.is_valid).length})</span>
			</div>
		</div>
	{/if}
</div>


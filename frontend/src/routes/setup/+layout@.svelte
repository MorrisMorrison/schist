<!--
Setup page should have its own layout, separate from the main app layout.
This prevents the need for authentication checks on the setup page.
-->
<script lang="ts">
	let { children } = $props();
</script>

{@render children()}

// Два способи деплою, адаптер обирається сам:
//
// — Vercel (VERCEL=1 на їхній збірці) → adapter-vercel: функції Node.js.
//   Стан, що мусить бути спільним між копіями функцій, живе в Redis і в
//   черзі QStash — див. src/lib/server/runtime.ts і AGENTS, розділ 2.1.
// — усе інше (Hostinger Business Web Hosting) → adapter-node: один
//   довгоживучий Node-процес; таймери хвиль, ліміти й кеші — у його памʼяті.
//
// adapter-auto тут не підходить: Hostinger він не розпізнає ("Could not
// detect a supported production environment").
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';

const onVercel = process.env.VERCEL === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: onVercel
			? adapterVercel({
					runtime: 'nodejs22.x',
					// Регіон функцій — поруч із базою Neon: кожен запит робить
					// кілька походів у базу, і океан між ними видно в кожному.
					// fra1 — Франкфурт (Neon aws-eu-central-1). Інший регіон
					// бази — постав свій через ZUNOR_VERCEL_REGION.
					regions: [process.env.ZUNOR_VERCEL_REGION || 'fra1']
				})
			: adapterNode()
	}
};

export default config;

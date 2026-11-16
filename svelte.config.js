// * адаптер обирається сам: Vercel (VERCEL=1) → adapter-vercel, усе інше
// * (Hostinger) → adapter-node, один довгоживучий процес. adapter-auto
// * Hostinger не розпізнає
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';

const onVercel = process.env.VERCEL === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// * Force runes mode for the project, except for libraries. Can be removed in svelte 6
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// * CSP ставить SvelteKit: лише він знає nonce сторінки, тож 'unsafe-inline'
		// * у script-src не потрібен. style-src його лишає: переходи Svelte й тости
		// * малюють стилі в рядку
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://js.pusher.com'],
				'style-src': ['self', 'unsafe-inline'],
				// * картинки — лише свої й Cloudinary: інакше будь-яке чуже
				// * посилання в профілі стає трекінг-пікселем
				'img-src': [
					'self',
					'data:',
					'blob:',
					'https://res.cloudinary.com',
					'https://*.googleusercontent.com'
				],
				'media-src': ['self', 'blob:', 'https://res.cloudinary.com'],
				'font-src': ['self', 'data:'],
				'connect-src': [
					'self',
					'https://api.cloudinary.com',
					'https://*.pusher.com',
					'wss://*.pusher.com',
					'https://sockjs-eu.pusher.com'
				],
				// * Google OAuth редіректить top-level, не в iframe — 'none' коректно
				'frame-src': ['none'],
				'frame-ancestors': ['none'],
				'object-src': ['none'],
				'base-uri': ['self'],
				// * 'self' достатньо: better-auth сам робить POST на /api/auth/*,
				// * редірект на accounts.google.com іде через 302, не через form
				'form-action': ['self']
			}
		},
		adapter: onVercel
			? adapterVercel({
					runtime: 'nodejs22.x',
					// * регіон функцій — поруч із базою: fra1 (Neon aws-eu-central-1); інший —
					// * через ZUNOR_VERCEL_REGION
					regions: [process.env.ZUNOR_VERCEL_REGION || 'fra1']
				})
			: adapterNode()
	}
};

export default config;

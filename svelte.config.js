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
		// Content-Security-Policy. Її ставить SvelteKit, а не hooks.server.ts:
		// лише він знає nonce, яким позначає власні вбудовані скрипти кожної
		// сторінки. Зі зібраним руками заголовком доводилось дозволяти
		// `script-src 'unsafe-inline'` — а така CSP від XSS не захищає: будь-який
		// вставлений <script> виконався б. Тепер скрипт без nonce сторінки
		// браузер не запускає. Вбудовані скрипти в src/app.html несуть
		// `nonce="%sveltekit.nonce%"`.
		//
		// style-src лишає 'unsafe-inline': переходи Svelte й тости малюють
		// стилі в рядку, а стиль, на відміну від скрипта, коду не виконує.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://js.pusher.com'],
				'style-src': ['self', 'unsafe-inline'],
				// Картинки — лише свої й Cloudinary: інакше будь-яке чуже
				// посилання в профілі стає трекінг-пікселем.
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
				// Google OAuth редіректить top-level, не в iframe — 'none' коректно.
				'frame-src': ['none'],
				'frame-ancestors': ['none'],
				'object-src': ['none'],
				'base-uri': ['self'],
				// 'self' достатньо: better-auth сам робить POST на /api/auth/*,
				// редірект на accounts.google.com іде через 302, не через form.
				'form-action': ['self']
			}
		},
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

// adapter-node, а не adapter-auto: деплой на Hostinger Business Web Hosting —
// це звичайний довгоживучий Node-процес, а не serverless-платформа, яку
// adapter-auto вміє розпізнати (на збірці він чесно писав
// "Could not detect a supported production environment").
//
// Наслідок для коду: процес ОДИН і живе довго. Тому стан у пам'яті
// (rate-limit, presence, account-cache, планувальник хвиль диспетчера)
// працює як задумано — спільного сховища на кшталт Redis не потрібно.
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter()
	}
};

export default config;

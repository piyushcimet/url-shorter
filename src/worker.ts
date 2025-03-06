import { Router, error } from 'itty-router';
const router = Router();

/**
 * @typedef {Object} Env
 * @property {KVNamespace} CM8ME_KV - The KV namespace for storing shortened URLs.
 * @property {string} HOST_URL - The base URL for shortened links.
 * @property {string} API_TOKEN - The API token for authentication.
 */

/**
 * @typedef {Object} JSONBody
 * @property {string} url - The original long URL to be shortened.
 */

/**
 * Middleware function to check API token authentication.
 * @param {Request} request - The incoming request object.
 * @param {Env} env - The environment variables.
 * @returns {Response|void} - Returns a 401 error if authentication fails.
 */

interface Env {
	CM8ME_KV: KVNamespace;
	HOST_URL: string;
	API_TOKEN: string;
}

interface JSONBody {
	url: string;
}

const withAuthentication = async (request: Request, env: Env): Promise<Response | void> => {
	const token = request.headers.get('Authorization');
	const apiToken = env.API_TOKEN;
	if (token !== apiToken) return error(401, 'Invalid API token.');
};

/**
 * Serves the homepage with instructions on how to use the URL shortener.
 * @param {Request} request - The incoming request object.
 * @param {Env} env - The environment variables.
 * @returns {Response} - Returns an HTML page with instructions.
 */

router.get('/', async (request: Request, env: Env): Promise<Response> => {
	return new Response(
		`
        <!DOCTYPE html>
        <html>

		<head>
				<title>Cimet's URL Shortener</title>
		</head>

		<body style="background-color: #F5F5F5; font-family: Arial, sans-serif; margin: 0; padding: 0;">
				<div style="display: flex; justify-content: center; align-items: center; height: 100vh;">
						<div style="background-color: #ffffff; border-radius: 10px; box-shadow: 0px 0px 10px 0px rgba(0,0,0,0.1); padding: 20px;">
								<h1 style="color: #333333; text-align: center;">Cimet's URL Shortener</h1>

								<p style="text-align: center; margin-bottom: 20px;">
										To get your API token for URL shortening, please send an email to: <a href="mailto:tech@cimet.com.au">tech@cimet.com.au</a>
								</p>

								<h2 style="text-align: center;">Instructions</h2>
								<p style="text-align: justify;">
										Once you have received your API token, you can shorten a URL by making a POST request to the path '/' with a payload containing 'url': 'your long url here'.
								</p>

								<pre style="background-color: #f8f8f8; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
		{
				"url": "http://www.your-long-url.com"
		}
								</pre>

								<p style="text-align: justify;">
										Make sure to include your API token in the request header as 'Authorization'.
								</p>

								<pre style="background-color: #f8f8f8; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
		headers = {
				"Authorization": "your_api_token"
		}
								</pre>

						</div>
				</div>
		</body>

        </html>`,
		{ headers: { 'Content-Type': 'text/html' } },
	);
});

/**
 * Handles URL shortening via POST request.
 * @param {Request} request - The incoming request object.
 * @param {Env} env - The environment variables.
 * @returns {Response} - Returns the shortened URL as JSON.
 */

router.post('/', withAuthentication, async (request, env) => {
	const json: JSONBody = await request.json();
	const longLink = json?.url;

	let slug = Math.random().toString(36).slice(-7);
	while (await env.CM8ME_KV.get(slug)) {
		slug = Math.random().toString(36).slice(-7);
	}

	await env.CM8ME_KV.put(slug, longLink);
	return new Response(JSON.stringify({ url: `${env.HOST_URL}/${slug}` }), {
		headers: { 'content-type': 'application/json' },
	});
});

/**
 * Shortens a given URL using GET request.
 * @param {Request} request - The incoming request object.
 * @param {Env} env - The environment variables.
 * @returns {Response} - Returns the shortened URL as JSON.
 */

router.get('/shorten/:url', async (request, env) => {
	try {
		let longLink = decodeURIComponent(request.params.url);
		console.log('Received long URL:', longLink);

		let httpsURL = `https://${longLink}`;
		let httpURL = `http://${longLink}`;
		let finalURL = httpsURL;

		try {
			const response = await fetch(httpsURL, { method: 'HEAD' });
			if (!response.ok) {
				console.warn(`HTTPS not reachable, falling back to HTTP for ${longLink}`);
				finalURL = httpURL;
			}
		} catch {
			console.warn(`HTTPS request failed, using HTTP for ${longLink}`);
			finalURL = httpURL;
		}

		new URL(finalURL);

		let slug = Math.random().toString(36).slice(-7);
		while (await env.CM8ME_KV.get(slug)) {
			slug = Math.random().toString(36).slice(-7);
		}

		await env.CM8ME_KV.put(slug, finalURL);
		return new Response(JSON.stringify({ short_url: `cm8.me/${slug}` }), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err) {
		console.error('Error in /shorten/:url:', err);
		return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
	}
});

/**
 * Lists all stored keys in the KV storage.
 * @param {Request} req - The incoming request object.
 * @param {Env} env - The environment variables.
 * @returns {Response} - Returns a JSON list of keys.
 */

router.get('/keys/list', async (req, env) => {
	const { cursor } = req.query;
	const keys = await env.CM8ME_KV.list({ cursor });
	return new Response(JSON.stringify(keys));
});

/**
 * Redirects a shortened URL to its original long URL.
 * @param {Request} request - The incoming request object.
 * @param {Env} env - The environment variables.
 * @returns {Response} - Redirects to the original URL or returns a 404 error.
 */

router.get('/:slug', async (request, env) => {
	const slug = request.params.slug;

	const redirectTo = await env.CM8ME_KV.get(slug);

	if (redirectTo) {
		return Response.redirect(redirectTo, 302);
	}
	return new Response(JSON.stringify({ error: 'URL not found' }), { status: 404 });
});

/**
 * Handles incoming requests and routes them to appropriate handlers.
 * @param {Request} request - The incoming request object.
 * @param {Env} env - The environment variables.
 * @param {ExecutionContext} ctx - The execution context for async tasks.
 * @returns {Promise<Response>} - Returns the processed response.
 */

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return router.handle(request, env, ctx).then((res: Response) => {
			return res;
		});
	},
};

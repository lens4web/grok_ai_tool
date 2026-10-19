const { test, afterEach, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const compiled = file => require(path.join(process.env.TEST_BUILD_PATH, file));
const { buildRequest, ValidationError } = compiled('lib/requests.js');
const { configureVideoVoices, normalizeParameters, getOptions, videoModes } = compiled('lib/options.js');
const { normalizeResponse } = compiled('lib/responses.js');
const { pcmWav } = compiled('lib/realtime.js');
const { xaiModels } = compiled('lib/models.js');
const { POST, GET } = compiled('app/api/grok/route.js');
const { NextRequest } = require('next/server');
const { createSession, getSession, SESSION_COOKIE, limitSession, beginGeneration, readBoundedJson, redactSecrets } = compiled('lib/security.js');
const sessionId = createSession('xai-test_secret_123456789');
const securityHeaders = { cookie: `${SESSION_COOKIE}=${sessionId}`, origin: 'http://localhost', 'X-Grok-Request': '1', 'Sec-Fetch-Site': 'same-origin' };
const sessionRequest = new NextRequest('http://localhost/api/grok', { headers: securityHeaders });
beforeEach(() => { const session = getSession(sessionRequest); session.requests = []; session.generations = []; session.active = 0; });
const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });
const image = (role = 'reference', timestamp) => ({ name: 'frame.png', mime: 'image/png', url: 'data:image/png;base64,aGVsbG8=', role, timestamp });
const audio = { name: 'record.mp3', mime: 'audio/mpeg', url: 'data:audio/mpeg;base64,aGVsbG8=' };
const video = { name: 'clip.mp4', mime: 'video/mp4', url: 'data:video/mp4;base64,aGVsbG8=', duration: 5 };
const input = (model, extra = {}) => ({ model, prompt: 'Привет', parameters: {}, files: [], mode: 'text', ...extra });
const request = (body, authorization = 'Bearer test-key') => new NextRequest('http://localhost/api/grok', { method: 'POST', headers: { ...securityHeaders, ...(authorization ? {} : { cookie: '' }), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const fixture = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('Every catalog model has valid defaults and a documented transport', () => {
  for (const model of xaiModels) {
    const extra = model.kind === 'stt' ? { prompt: '', files: [audio] } : {};
    const params = normalizeParameters(model, {}, 'text');
    const built = buildRequest(input(model.id, { ...extra, parameters: params }));
    assert.ok(built.endpoint.startsWith('/'));
    assert.ok(getOptions(model).length > 0);
  }
});
test('TTS uses /tts, text, voice_id, language, nested output_format without model/input', () => {
  const result = buildRequest(input('grok-tts', { parameters: { voice_id: 'eve', language: 'ru', codec: 'wav', sample_rate: 48000, speed: 1.2, with_timestamps: true } }));
  assert.equal(result.endpoint, '/tts'); assert.equal(result.body.model, undefined); assert.equal(result.body.input, undefined);
  assert.equal(result.body.text, 'Привет'); assert.equal(result.body.voice_id, 'eve'); assert.equal(result.body.language, 'ru');
  assert.deepEqual(result.body.output_format, { codec: 'wav', sample_rate: 48000 });
  assert.equal(result.body.with_timestamps, true);
});
test('TTS rejects MP3-only bitrate on WAV and limits Unicode characters', () => {
  assert.throws(() => buildRequest(input('grok-tts', { parameters: { codec: 'wav', bit_rate: 128000 } })), ValidationError);
  assert.throws(() => buildRequest(input('grok-tts', { prompt: 'a'.repeat(60001) })), ValidationError);
  assert.doesNotThrow(() => buildRequest(input('grok-tts', { prompt: '🎵'.repeat(60000) })));
});
test('TTS pronunciation maps and custom voice IDs are validated', () => {
  const built = buildRequest(input('grok-tts', { parameters: { custom_voice_id: 'abcdef12', replace: '{"Acme":"Ackmee"}' } }));
  assert.equal(built.body.voice_id, 'abcdef12'); assert.deepEqual(built.body.replace, { Acme: 'Ackmee' });
  assert.throws(() => buildRequest(input('grok-tts', { parameters: { replace: '[]' } })), ValidationError);
});
test('Voice IDs returned by the live roster are not silently replaced by static defaults', () => {
  const model = xaiModels.find(m => m.id === 'grok-tts');
  assert.equal(normalizeParameters(model, { voice_id: 'new-voice' }, 'text').voice_id, 'new-voice');
  assert.equal(buildRequest(input('grok-tts', { parameters: { voice_id: 'new-voice' } })).body.voice_id, 'new-voice');
});
test('Video 1.5 uses pinned frames, sorted keyframes and voice references', () => {
  const built = buildRequest(input('grok-imagine-video-1.5', { mode: 'reference', files: [image('first'), image('last'), image('keyframe', 2), image()], referenceVoices: ['eve'], parameters: { duration: 8, resolution: '720p' } }));
  assert.deepEqual(built.body.image, { url: image().url }); assert.ok(built.body.last_frame);
  assert.deepEqual(built.body.reference_audios, [{ voice_id: 'eve' }]); assert.equal(built.body.keyframes[0].timestamp_s, 2);
  assert.equal(built.body.images, undefined);
});
test('Classic video sends seven image references separately from its starting frame', () => {
  const built = buildRequest(input('grok-imagine-video', { mode: 'reference', files: Array.from({ length: 7 }, () => image()), parameters: { duration: 10, resolution: '720p' } }));
  assert.equal(built.endpoint, '/videos/generations');
  assert.deepEqual(built.body.reference_images, Array.from({ length: 7 }, () => ({ url: image().url })));
  assert.equal(built.body.image, undefined); assert.equal(built.body.reference_audios, undefined);
  for (const extra of [{ files: Array.from({ length: 8 }, () => image()) }, { files: [image('first')] }, { referenceVoices: ['eve'] }]) {
    assert.throws(() => buildRequest(input('grok-imagine-video', { mode: 'reference', files: [image()], ...extra })), ValidationError);
  }
});
test('Selecting a video voice converts text generation to voice-only references with 720p', () => {
  const model = xaiModels.find(m => m.id === 'grok-imagine-video-1.5');
  const next = configureVideoVoices(model, { mode: 'text', parameters: { resolution: '1080p', duration: 12 }, files: [], referenceVoices: [] }, ['leo']);
  const built = buildRequest(input(model.id, { ...next, prompt: 'Персонаж говорит голосом <AUDIO_0>: Привет!' }));
  assert.equal(next.mode, 'reference'); assert.equal(built.body.resolution, '720p'); assert.equal(built.body.duration, 12);
  assert.deepEqual(built.body.reference_audios, [{ voice_id: 'leo' }]); assert.equal(built.body.reference_images, undefined);
  assert.throws(() => buildRequest(input(model.id, { ...next, prompt: '' })), ValidationError);
});
test('Selecting and removing a voice preserves an animated image as the starting frame', () => {
  const model = xaiModels.find(m => m.id === 'grok-imagine-video-1.5');
  const original = { mode: 'image', parameters: { resolution: '1080p' }, files: [image()], referenceVoices: [] };
  const selected = configureVideoVoices(model, original, ['eve']);
  const built = buildRequest(input(model.id, selected));
  assert.equal(selected.files[0].role, 'first'); assert.deepEqual(built.body.image, { url: image().url });
  assert.equal(built.body.reference_images, undefined); assert.equal(original.files[0].role, 'reference');
  const removed = configureVideoVoices(model, selected, []);
  assert.equal(removed.mode, 'image'); assert.deepEqual(buildRequest(input(model.id, removed)).body.image, built.body.image);
});
test('Removing the last voice or disabling sound leaves a valid text or image-reference mode', () => {
  const model = xaiModels.find(m => m.id === 'grok-imagine-video-1.5');
  const current = { mode: 'reference', parameters: { generate_audio: false }, files: [], referenceVoices: ['eve'] };
  const silent = configureVideoVoices(model, current, []);
  assert.equal(silent.mode, 'text'); assert.equal(buildRequest(input(model.id, silent)).body.generate_audio, false);
  const withImages = configureVideoVoices(model, { ...current, files: [image()] }, []);
  assert.equal(withImages.mode, 'reference'); assert.equal(buildRequest(input(model.id, withImages)).body.generate_audio, false);
  assert.equal(configureVideoVoices(model, current, ['ara']).parameters.generate_audio, true);
});
test('Pinned last frame can be used without prompt', () => {
  assert.doesNotThrow(() => buildRequest(input('grok-imagine-video-1.5', { prompt: '', mode: 'reference', files: [image('last')] })));
});
test('Video references reject 1080p, too many voices, silent voices and duplicate keyframe slots', () => {
  const base = input('grok-imagine-video-1.5', { mode: 'reference', files: [image()] });
  for (const extra of [{ parameters: { resolution: '1080p' } }, { referenceVoices: ['eve', 'ara', 'leo', 'rex'] }, { referenceVoices: ['eve'], parameters: { generate_audio: false } }, { files: [image('keyframe', 1), image('keyframe', 1.1)] }, { files: [image('keyframe', 8)] }]) assert.throws(() => buildRequest({ ...base, ...extra }), ValidationError);
});
test('Video roles and inputs cannot be mixed with text/image modes', () => {
  assert.throws(() => buildRequest(input('grok-imagine-video-1.5', { files: [image()] })), ValidationError);
  assert.throws(() => buildRequest(input('grok-imagine-video-1.5', { mode: 'image', referenceVoices: ['eve'], files: [image()] })), ValidationError);
  assert.throws(() => buildRequest(input('grok-imagine-video', { mode: 'reference', files: [image('last')] })), ValidationError);
  assert.throws(() => buildRequest(input('grok-imagine-video-1.5', { mode: 'reference', files: Array.from({length: 8}, () => image()) })), ValidationError);
});
test('Image-to-video preserves the input ratio by default and allows 1080p', () => {
  const built = buildRequest(input('grok-imagine-video-1.5', { mode: 'image', files: [image()], parameters: { resolution: '1080p' } }));
  assert.equal(built.body.aspect_ratio, undefined); assert.equal(built.body.resolution, '1080p'); assert.ok(built.body.image);
});
test('Video edit/extend use their own endpoints and enforce source and output limits', () => {
  const edit = buildRequest(input('grok-imagine-video', { mode: 'edit', files: [video] }));
  assert.equal(edit.endpoint, '/videos/edits'); assert.equal(edit.body.duration, undefined); assert.ok(edit.body.video);
  const extend = buildRequest(input('grok-imagine-video', { mode: 'extend', files: [video], parameters: { duration: 10 } }));
  assert.equal(extend.endpoint, '/videos/extensions'); assert.equal(extend.body.duration, 10); assert.equal(extend.body.resolution, undefined);
  for (const extra of [{ parameters: { resolution: '720p' } }, { parameters: { duration: 1 } }, { files: [{ ...video, duration: 16 }] }]) assert.throws(() => buildRequest(input('grok-imagine-video', { mode: 'extend', files: [video], ...extra })), ValidationError);
  assert.throws(() => buildRequest(input('grok-imagine-video', { mode: 'edit', files: [{ ...video, duration: 9 }] })), ValidationError);
  assert.throws(() => buildRequest(input('grok-imagine-video-1.5', { mode: 'edit', files: [video] })), ValidationError);
  assert.throws(() => buildRequest(input('grok-imagine-video-1.5-lite', { mode: 'edit', files: [video] })), ValidationError);
  assert.throws(() => buildRequest(input('grok-imagine-video-1.5-lite', { mode: 'extend', files: [video] })), ValidationError);
});
test('Video 1.5 Lite supports text-to-video and image-to-video with audio and ultrawide ratios, but rejects reference mode, edits and voice references', () => {
  const model = xaiModels.find(m => m.id === 'grok-imagine-video-1.5-lite');
  assert.ok(model);
  assert.deepEqual(model.inputModalities, ['TEXT', 'IMAGE']);
  assert.deepEqual(model.outputModalities, ['VIDEO']);
  assert.equal(model.pricing.video, 0.02);
  assert.equal(model.maxAttachments, 1);
  assert.deepEqual(videoModes(model), ['text', 'image']);

  const i2v = buildRequest(input('grok-imagine-video-1.5-lite', {
    mode: 'image',
    prompt: '',
    files: [image()],
    parameters: { duration: 10, resolution: '720p', generate_audio: true },
  }));
  assert.equal(i2v.endpoint, '/videos/generations');
  assert.deepEqual(i2v.body.image, { url: image().url });
  assert.equal(i2v.body.prompt, undefined);
  assert.equal(i2v.body.aspect_ratio, undefined);
  assert.equal(i2v.body.duration, 10);
  assert.equal(i2v.body.resolution, '720p');
  assert.equal(i2v.body.generate_audio, true);

  const textReq = buildRequest(input('grok-imagine-video-1.5-lite', {
    mode: 'text',
    prompt: 'A cinematic drone shot over mountains',
    parameters: { resolution: '1080p', duration: 5, aspect_ratio: '21:9' },
  }));
  assert.equal(textReq.body.resolution, '1080p');
  assert.equal(textReq.body.duration, 5);
  assert.equal(textReq.body.aspect_ratio, '21:9');

  assert.throws(() => buildRequest(input('grok-imagine-video-1.5-lite', {
    mode: 'reference',
    files: [image()],
  })), ValidationError);

  assert.throws(() => buildRequest(input('grok-imagine-video-1.5-lite', {
    mode: 'image',
    files: [image(), image()],
  })), ValidationError);

  assert.throws(() => buildRequest(input('grok-imagine-video-1.5-lite', {
    mode: 'text',
    prompt: 'hello',
    referenceVoices: ['eve'],
  })), ValidationError);
});
test('Switching modes or codecs drops incompatible controls', () => {
  const videoModel = xaiModels.find(m => m.id === 'grok-imagine-video');
  assert.equal(normalizeParameters(videoModel, { resolution: '720p', aspect_ratio: '16:9', duration: 15 }, 'edit').resolution, undefined);
  const tts = xaiModels.find(m => m.id === 'grok-tts');
  assert.equal(normalizeParameters(tts, { codec: 'pcm', bit_rate: 128000 }, 'text').bit_rate, undefined);
});
test('Image editing uses image/images exclusively and preserves all generated outputs', () => {
  const one = buildRequest(input('grok-imagine-image-2.0', { files: [image()] }));
  assert.equal(one.endpoint, '/images/edits'); assert.ok(one.body.image); assert.equal(one.body.images, undefined);
  const many = buildRequest(input('grok-imagine-image-2.0', { files: [image(), image()], parameters: { n: 2, quality: 'medium' } }));
  assert.equal(many.body.images.length, 2); assert.equal(many.body.image, undefined);
  assert.throws(() => buildRequest(input('grok-imagine-image', { parameters: { quality: 'medium' } })), ValidationError);
  const result = normalizeResponse('image', { data: [{ url: 'https://images.x.ai/1.jpg' }, { b64_json: 'aGVsbG8=', mime_type: 'image/png' }] });
  assert.equal(result.urls.length, 2); assert.equal(result.urls[1], 'data:image/png;base64,aGVsbG8=');
});
test('Chat reasoning uses Responses API and attaches images only to current input', () => {
  const built = buildRequest(input('grok-4.7', { files: [image()], parameters: { reasoning_effort: 'xhigh' } }));
  assert.equal(built.endpoint, '/responses'); assert.deepEqual(built.body.reasoning, { effort: 'xhigh' });
  assert.equal(built.body.input[0].content[1].type, 'input_image'); assert.equal(built.body.reasoningEffort, undefined);
  assert.equal(built.body.max_output_tokens, undefined); assert.equal(built.body.store, false);
  assert.throws(() => buildRequest(input('grok-4.5', { parameters: { reasoning_effort: 'xhigh' } })), ValidationError);
  assert.throws(() => buildRequest(input('grok-4.20-0309-reasoning', { parameters: { reasoning_effort: 'low' } })), ValidationError);
});
test('Temperature and top_p are mutually exclusive; JSON output has instructions', () => {
  const built = buildRequest(input('grok-4.7', { parameters: { sampling: 'top_p', top_p: 0.8, response_format: 'json_object' } }));
  assert.equal(built.body.temperature, undefined); assert.equal(built.body.top_p, 0.8); assert.match(built.body.instructions, /JSON/);
  assert.throws(() => buildRequest(input('grok-4.7', { parameters: { sampling: 'temperature', temperature: 1, top_p: 0.5 } })), ValidationError);
});
test('Structured JSON Schema is passed in the Responses text format', () => {
  const schema = { name: 'answer', schema: { type: 'object', properties: {} }, strict: true };
  const built = buildRequest(input('grok-4.7', { parameters: { response_format: 'json_schema', json_schema: JSON.stringify(schema) } }));
  assert.deepEqual(built.body.text.format, { type: 'json_schema', ...schema });
  assert.throws(() => buildRequest(input('grok-4.7', { parameters: { response_format: 'json_schema', json_schema: '{}' } })), ValidationError);
});
test('Transcription requires audio, language for formatting and valid raw options', () => {
  assert.throws(() => buildRequest(input('grok-voice-transcribe-2.0')), ValidationError);
  assert.throws(() => buildRequest(input('grok-voice-transcribe-2.0', { prompt: '', files: [audio], parameters: { format: true } })), ValidationError);
  assert.doesNotThrow(() => buildRequest(input('grok-voice-transcribe-2.0', { prompt: '', files: [audio], parameters: { format: true, language: 'ru' } })));
  assert.throws(() => buildRequest(input('grok-voice-transcribe-2.0', { prompt: '', files: [audio], parameters: { audio_format: 'pcm' } })), ValidationError);
});
test('Responses parsing handles output_text blocks, refusal, incomplete answers and STT text', () => {
  const text = normalizeResponse('chat', { output: [{ type: 'reasoning', content: [] }, { type: 'message', content: [{ type: 'output_text', text: 'Ответ' }] }] });
  assert.equal(text.content, 'Ответ');
  assert.equal(normalizeResponse('stt', { text: 'Transcript', words: [] }).content, 'Transcript');
  assert.throws(() => normalizeResponse('chat', { status: 'incomplete', output: [] }), /лимит/);
  assert.equal(normalizeResponse('chat', { output: [{ type: 'message', content: [{ refusal: 'Отказ' }] }] }).content, 'Отказ');
});
test('Video parsing handles nested video.url, moderation, failed and expired jobs', () => {
  assert.equal(normalizeResponse('video', { status: 'done', video: { url: 'https://vidgen.x.ai/video.mp4' } }).content, 'https://vidgen.x.ai/video.mp4');
  for (const data of [{ status: 'expired' }, { status: 'failed' }, { status: 'done', video: { url: 'https://vidgen.x.ai/v.mp4', respect_moderation: false } }, { status: 'done', video: {} }]) assert.throws(() => normalizeResponse('video', data));
});
test('Malformed input, model overrides and invalid files are rejected before upstream calls', async () => {
  global.fetch = () => { assert.fail('Upstream must not be called'); };
  for (const body of [null, input('unknown'), input('grok-tts', { parameters: { model: 'grok-4.7' } }), input('grok-4.7', { files: [{ ...image(), mime: 'image/gif' }] }), input('grok-4.7', { files: [{ ...image(), url: 'data:image/png;base64,!!' }] })]) assert.equal((await POST(request(body))).status, 400);
  assert.equal((await POST(request(input('grok-tts'), ''))).status, 401);
});
test('TTS route supports binary and JSON timestamp envelopes', async () => {
  let captured;
  global.fetch = async (url, init) => { captured = { url, body: JSON.parse(init.body) }; return new Response(new Uint8Array([1,2,3]), { headers: { 'Content-Type': 'application/octet-stream' } }); };
  const result = await (await POST(request(input('grok-tts', { parameters: { codec: 'wav' } })))).json();
  assert.equal(captured.url, 'https://api.x.ai/v1/tts'); assert.equal(result.result.content, 'data:audio/wav;base64,AQID');
  global.fetch = async () => fixture({ audio: 'AQID', content_type: 'audio/mpeg', audio_timestamps: { graph_chars: ['A'], graph_times: [[0,1]] } });
  const stamped = await (await POST(request(input('grok-tts', { parameters: { with_timestamps: true } })))).json();
  assert.deepEqual(stamped.result.metadata.audio_timestamps.graph_times, [[0,1]]);
});
test('STT route sends actual bytes as multipart and puts file last', async () => {
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.x.ai/v1/stt'); assert.ok(init.body instanceof FormData); assert.equal(init.headers['Content-Type'], undefined);
    const entries = [...init.body.entries()]; assert.equal(entries.at(-1)[0], 'file');
    assert.equal(await entries.at(-1)[1].text(), 'hello'); assert.deepEqual(init.body.getAll('keyterm'), ['Grok', 'xAI']);
    return fixture({ text: 'Расшифровка', words: [] });
  };
  const response = await POST(request(input('grok-voice-transcribe-2.0', { prompt: '', files: [audio], parameters: { keyterms: 'Grok\nxAI' } })));
  assert.equal(response.status, 200); assert.equal((await response.json()).result.content, 'Расшифровка');
});
test('Video submission returns 202 immediately and status checks return playable result', async () => {
  global.fetch = async url => { assert.equal(url, 'https://api.x.ai/v1/videos/generations'); return fixture({ request_id: 'job-123' }); };
  const submitted = await POST(request(input('grok-imagine-video-1.5'))); assert.equal(submitted.status, 202);
  global.fetch = async url => { assert.equal(url, 'https://api.x.ai/v1/videos/job-123'); return fixture({ status: 'done', video: { url: 'https://vidgen.x.ai/video.mp4' } }); };
  const completed = await GET(new NextRequest('http://localhost/api/grok?request_id=job-123', { headers: securityHeaders }));
  assert.equal(completed.status, 200); assert.equal((await completed.json()).result.type, 'video');
});
test('Video route forwards classic image references and 1.5 voice-only references', async () => {
  for (const payload of [
    input('grok-imagine-video', { mode: 'reference', files: [image()], parameters: { duration: 10 } }),
    input('grok-imagine-video-1.5', { mode: 'reference', referenceVoices: ['ara', 'leo'] }),
  ]) {
    global.fetch = async (url, init) => {
      assert.equal(url, 'https://api.x.ai/v1/videos/generations');
      const body = JSON.parse(init.body);
      assert.equal(body.model, payload.model);
      if (payload.files.length) assert.deepEqual(body.reference_images, [{ url: image().url }]);
      else { assert.deepEqual(body.reference_audios, [{ voice_id: 'ara' }, { voice_id: 'leo' }]); assert.equal(body.image, undefined); }
      return fixture({ request_id: 'references-job' });
    };
    const response = await POST(request(payload));
    assert.equal(response.status, 202); assert.equal((await response.json()).request_id, 'references-job');
  }
});
test('Failed/expired polling is an error, pending is 202, IDs cannot change endpoint', async () => {
  getSession(sessionRequest).jobs.add('job');
  const req = id => new NextRequest(`http://localhost/api/grok?request_id=${encodeURIComponent(id)}`, { headers: securityHeaders });
  for (const status of ['failed', 'expired']) { global.fetch = async () => fixture({ status }); assert.equal((await GET(req('job-123'))).status, 502); }
  global.fetch = async () => fixture({ status: 'pending' }); assert.equal((await GET(req('job-123'))).status, 202);
  assert.equal((await GET(req('../tts'))).status, 400);
});
test('Upstream errors preserve HTTP status and Retry-After, including HTML and malformed success', async () => {
  global.fetch = async () => new Response('<html>Rate limited</html>', { status: 429, headers: { 'retry-after': '10' } });
  const rate = await POST(request(input('grok-tts'))); assert.equal(rate.status, 429); assert.equal(rate.headers.get('retry-after'), '10'); assert.match((await rate.json()).error, /Rate limited/);
  global.fetch = async () => new Response('not-json', { status: 200 });
  assert.equal((await POST(request(input('grok-4.7')))).status, 502);
  global.fetch = async () => new Response(new Uint8Array([1]), { status: 403, headers: { 'Content-Type': 'audio/mpeg' } });
  assert.equal((await POST(request(input('grok-tts')))).status, 403);
});
test('Voice model requests ephemeral token, never a chat or transcription endpoint', async () => {
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.x.ai/v1/realtime/client_secrets'); assert.deepEqual(JSON.parse(init.body), { expires_after: { seconds: 300 } });
    return fixture({ value: 'ephemeral', expires_at: 123 });
  };
  const response = await POST(request(input('grok-voice-think-fast-2.0')));
  assert.equal(response.status, 200); assert.equal((await response.json()).token, 'ephemeral');
});
test('PCM voice output produces a valid mono WAV container', async () => {
  const bytes = new Uint8Array(await pcmWav([new Uint8Array([1,2,3,4])]).arrayBuffer());
  const view = new DataView(bytes.buffer); assert.equal(Buffer.from(bytes.slice(0,4)).toString(), 'RIFF');
  assert.equal(view.getUint32(24, true), 24000); assert.equal(view.getUint32(40, true), 4); assert.deepEqual([...bytes.slice(44)], [1,2,3,4]);
});

test('Realtime text turn waits for session.updated and collects audio plus transcript', async () => {
  const { generateVoice } = compiled('lib/realtime.js');
  const Original = global.WebSocket;
  const sent = [];
  let closed = false;
  global.WebSocket = class {
    constructor(url, protocols) {
      assert.match(url, /model=grok-voice-think-fast-2.0/);
      assert.deepEqual(protocols, ['xai-client-secret.ephemeral']);
      queueMicrotask(() => this.onopen());
    }
    send(text) {
      const event = JSON.parse(text); sent.push(event);
      if (event.type === 'session.update') queueMicrotask(() => this.onmessage({ data: JSON.stringify({ type: 'session.updated' }) }));
      if (event.type === 'response.create') queueMicrotask(() => {
        this.onmessage({ data: JSON.stringify({ type: 'response.output_audio.delta', delta: 'AQIDBA==' }) });
        this.onmessage({ data: JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'Ответ' }) });
        this.onmessage({ data: JSON.stringify({ type: 'response.done', response: { status: 'completed' } }) });
      });
    }
    close() { closed = true; }
  };
  try {
    const result = await generateVoice('ephemeral', 'grok-voice-think-fast-2.0', 'Привет', [], { voice: 'eve', reasoning_effort: 'high', speed: 1 }, new AbortController().signal);
    assert.deepEqual(sent.map(e => e.type), ['session.update', 'conversation.item.create', 'response.create']);
    assert.equal(sent[0].session.turn_detection, null); assert.equal(sent[0].session.audio.output.format.type, 'audio/pcm');
    assert.equal(result.mime, 'audio/wav'); assert.equal(result.metadata.transcript, 'Ответ'); assert.ok(closed);
    URL.revokeObjectURL(result.content);
  } finally { global.WebSocket = Original; }
});
test('Realtime errors, early socket closure and cancellation reject and clean up', async () => {
  const { generateVoice } = compiled('lib/realtime.js');
  const Original = global.WebSocket;
  try {
    for (const scenario of ['error', 'close', 'abort']) {
      const abort = new AbortController(); let closed = false;
      global.WebSocket = class {
        constructor() { queueMicrotask(() => {
          if (scenario === 'error') this.onmessage({ data: JSON.stringify({ type: 'error', error: { message: 'Bad voice' } }) });
          if (scenario === 'close') this.onclose();
          if (scenario === 'abort') abort.abort();
        }); }
        close() { closed = true; }
      };
      await assert.rejects(generateVoice('token', 'grok-voice-think-fast-2.0', 'Hello', [], {}, abort.signal));
      assert.ok(closed);
    }
  } finally { global.WebSocket = Original; }
});
test('Client video polling accepts normalized completion and surfaces fatal errors', async () => {
  const { pollVideo } = compiled('lib/client.js');
  global.fetch = async url => url.includes('action=download') ? new Response(Buffer.from('0000ftypmp42'), { headers: { 'content-type': 'video/mp4' } }) : fixture({ result: { type: 'video', content: 'https://vidgen.x.ai/a.mp4' } });
  const result = await pollVideo('job', new AbortController().signal, () => {});
  assert.equal(result.type, 'video'); assert.match(result.content, /^blob:/); assert.equal(result.sourceUrl, 'https://vidgen.x.ai/a.mp4');
  URL.revokeObjectURL(result.content);
  global.fetch = async () => new Response(JSON.stringify({ error: 'Expired' }), { status: 410 });
  await assert.rejects(pollVideo('job', new AbortController().signal, () => {}), /Expired/);
});
test('Cancellation interrupts pending polling immediately', async () => {
  const { pollVideo } = compiled('lib/client.js');
  const abort = new AbortController();
  global.fetch = async () => fixture({ status: 'pending' });
  const waiting = pollVideo('job', abort.signal, () => abort.abort());
  await assert.rejects(waiting, { name: 'AbortError' });
});

test('Older image models reject new 2.0-only aspect ratios and more than 3 source images', () => {
  for (const model of ['grok-imagine-image', 'grok-imagine-image-quality']) {
    assert.throws(() => buildRequest(input(model, { parameters: { aspect_ratio: '21:9' } })), ValidationError);
    assert.throws(() => buildRequest(input(model, { files: [image(), image(), image(), image()] })), ValidationError);
  }
  assert.doesNotThrow(() => buildRequest(input('grok-imagine-image-2.0', { parameters: { aspect_ratio: '21:9' }, files: [image(), image(), image(), image(), image()] })));
});
test('Chat image input enforces JPEG/PNG and 20 MiB, detail is transmitted', () => {
  assert.throws(() => buildRequest(input('grok-4.7', { files: [{ ...image(), mime: 'image/webp', url: 'data:image/webp;base64,aGVsbG8=' }] })), ValidationError);
  const built = buildRequest(input('grok-4.7', { files: [image()], parameters: { image_detail: 'high' } }));
  assert.equal(built.body.input[0].content[1].detail, 'high');
  const bytes = Buffer.alloc(20 * 1024 * 1024 + 1);
  assert.throws(() => buildRequest(input('grok-4.7', { files: [{ ...image(), url: `data:image/png;base64,${bytes.toString('base64')}` }] })), ValidationError);
});

test('UI formatting selection supplies a language and cannot retain automatic detection', () => {
  const model = xaiModels.find(m => m.id === 'grok-voice-transcribe-2.0');
  const normalized = normalizeParameters(model, { format: true, language: '' }, 'text');
  assert.equal(normalized.language, 'ru');
  assert.doesNotThrow(() => buildRequest(input(model.id, { prompt: '', files: [audio], parameters: normalized })));
});

test('All 20 locales contain complete UI dictionaries and preserve voice markers', () => {
  const { languages, translate, optionLabels } = compiled('lib/i18n.js');
  const messages = compiled('lib/locales/messages.json');
  assert.equal(languages.length, 20);
  for (const [key, values] of Object.entries(messages)) for (const [locale] of languages) {
    assert.equal(typeof values[locale], 'string', `${key}: missing ${locale}`);
    assert.ok(values[locale].trim(), `${key}: empty ${locale}`);
    assert.equal(translate(locale, key), values[locale]);
    if (key === 'Voice help') assert.ok(values[locale].includes('<AUDIO_0>'));
  }
  for (const label of Object.values(optionLabels)) assert.ok(messages[label] || ['Top P', 'JSON Schema: {name, schema, strict}'].includes(label), `Untranslated option ${label}`);
});
test('System language resolution handles regional locales, fallback order and RTL', () => {
  const { detectLocale, direction } = compiled('lib/i18n.js');
  for (const [input, expected] of [['pt-BR','pt'], ['zh-TW','zh'], ['uk-UA','uk'], ['ar-EG','ar'], ['en-US','en'], ['hi-IN','hi']]) assert.equal(detectLocale([input]), expected);
  assert.equal(detectLocale(['xx-XX', 'de-DE', 'en']), 'de'); assert.equal(detectLocale(['xx']), 'en');
  for (const code of ['ar', 'fa', 'ur']) assert.equal(direction(code), 'rtl');
  assert.equal(direction('ru'), 'ltr');
});
test('Every model has a translated summary and a sourced API date or explicit unknown', () => {
  const { modelInfo, formatReleaseDate } = compiled('lib/model-info.js');
  const { languages } = compiled('lib/i18n.js');
  const messages = compiled('lib/locales/messages.json');
  assert.deepEqual(Object.keys(modelInfo).sort(), xaiModels.map(model => model.id).sort());
  for (const model of xaiModels) {
    const info = modelInfo[model.id];
    assert.ok(messages[info.summary], model.id);
    assert.ok(/^https:\/\/(docs\.)?x\.ai\//.test(info.source), model.id);
    if (info.released) {
      assert.match(info.released, /^2026-\d{2}-\d{2}$/);
      assert.ok(info.released <= '2026-10-04');
      for (const [locale] of languages) assert.ok(formatReleaseDate(info.released, locale));
    } else assert.equal(model.id, 'grok-4.3');
  }
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(formatReleaseDate('2026-03-10', 'en'), 'Mar 10, 2026');
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
  assert.equal(modelInfo['grok-build-0.1'].earlyAccess, true);
});
test('Session connection returns only an opaque HttpOnly SameSite cookie and logout revokes it', async () => {
  const sessionRoute = compiled('app/api/session/route.js');
  const key = 'xai-private_test_secret_123456789';
  global.fetch = async (url, init) => { assert.equal(url, 'https://api.x.ai/v1/models'); assert.equal(init.headers.Authorization, `Bearer ${key}`); assert.equal(init.redirect, 'error'); return fixture({ data: [] }); };
  const connected = await sessionRoute.POST(new NextRequest('https://localhost/api/session', { method: 'POST', headers: { ...securityHeaders, cookie: '', origin: 'https://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }));
  assert.equal(connected.status, 200);
  const cookie = connected.headers.get('set-cookie');
  assert.match(cookie, /^__Host-grok_session=/); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i); assert.match(cookie, /Secure/i); assert.doesNotMatch(cookie, /xai-/);
  assert.equal(JSON.stringify(await connected.json()).includes(key), false);
  const sessionCookie = cookie.split(';')[0];
  const logged = new NextRequest('https://localhost/api/grok', { method: 'POST', headers: { ...securityHeaders, origin: 'https://localhost', cookie: sessionCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(input('grok-tts')) });
  global.fetch = async (_, init) => { assert.equal(init.headers.Authorization, `Bearer ${key}`); assert.equal(init.redirect, 'error'); return fixture({ audio: 'AQID' }); };
  assert.equal((await POST(logged)).status, 200);
  const loggedGet = new NextRequest('https://localhost/api/session', { headers: { ...securityHeaders, origin: 'https://localhost', cookie: sessionCookie } });
  assert.equal((await sessionRoute.GET(loggedGet)).status, 200);
  const logout = await sessionRoute.DELETE(loggedGet); assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i);
  global.fetch = () => assert.fail('Revoked sessions must not call xAI');
  const revoked = await POST(new NextRequest('https://localhost/api/grok', { method: 'POST', headers: { ...securityHeaders, origin: 'https://localhost', cookie: sessionCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(input('grok-tts')) }));
  assert.equal(revoked.status, 401);
});
test('Invalid credentials and failed verification never create a browser session or expose upstream secrets', async () => {
  const sessionRoute = compiled('app/api/session/route.js');
  const req = key => new NextRequest('http://localhost/api/session', { method: 'POST', headers: { ...securityHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
  global.fetch = () => assert.fail('Malformed keys cannot reach xAI');
  assert.equal((await sessionRoute.POST(req('invalid'))).status, 400);
  global.fetch = async () => new Response(JSON.stringify({ error: 'xai-sensitive_upstream_12345' }), { status: 401 });
  const rejected = await sessionRoute.POST(req('xai-invalid_secret_123456789'));
  assert.equal(rejected.status, 401); assert.equal(rejected.headers.get('set-cookie'), null);
  assert.doesNotMatch(await rejected.text(), /xai-/);
  global.fetch = async () => { throw new Error('Bearer xai-upstream_secret_12345'); };
  const unavailable = await sessionRoute.POST(req('xai-invalid_secret_123456789'));
  assert.equal(unavailable.status, 502); assert.equal(unavailable.headers.get('set-cookie'), null);
  assert.doesNotMatch(await unavailable.text(), /xai-/);
  assert.ok(getSession(sessionRequest), 'A failed replacement preserves the existing session');
});
test('Cross-origin, missing verification, bearer-only and unknown sessions cannot reach xAI', async () => {
  global.fetch = () => assert.fail('Forbidden requests must not reach xAI');
  for (const [extra, status] of [
    [{ origin: 'https://evil.example' },403], [{ 'Sec-Fetch-Site': 'cross-site' },403], [{ 'X-Grok-Request': '' },403],
    [{ origin: '', 'Sec-Fetch-Site': '', referer: '' },403], [{ cookie: '', authorization: 'Bearer xai-test_secret_123456789' },401], [{ cookie: 'grok_session=guessed' },401],
  ]) {
    const response = await POST(new NextRequest('http://localhost/api/grok', { method: 'POST', headers: { ...securityHeaders, ...extra, 'Content-Type': 'application/json' }, body: JSON.stringify(input('grok-tts')) }));
    assert.equal(response.status, status);
  }
});
test('Video jobs are scoped to their creating session', async () => {
  const foreign = createSession('xai-other_test_secret_123456789');
  getSession(sessionRequest).jobs.add('owned-video');
  global.fetch = () => assert.fail('Foreign jobs must not reach xAI');
  const response = await GET(new NextRequest('http://localhost/api/grok?request_id=owned-video', { headers: { ...securityHeaders, cookie: `${SESSION_COOKIE}=${foreign}` } }));
  assert.equal(response.status, 403);
});
test('Expired sessions fail before upstream and rate/concurrency limits enforce their bounds', () => {
  const expired = createSession('xai-expired_test_secret_123456789');
  const expiredReq = new NextRequest('http://localhost/api/grok', { headers: { ...securityHeaders, cookie: `${SESSION_COOKIE}=${expired}` } });
  getSession(expiredReq).expires = Date.now() - 1;
  assert.throws(() => getSession(expiredReq), error => error.status === 401);
  const session = getSession(sessionRequest);
  for (let i=0;i<12;i++) limitSession(session, true);
  assert.throws(() => limitSession(session, true), error => error.status === 429);
  session.requests=[]; session.generations=[];
  const one=beginGeneration(session), two=beginGeneration(session);
  assert.throws(() => beginGeneration(session), error => error.status === 429);
  one(); two(); assert.equal(session.active, 0);
  const extra = getSession(new NextRequest('http://localhost/api/grok', { headers: { cookie: `${SESSION_COOKIE}=${createSession('xai-extra_test_secret_123456789')}` } }));
  const a = beginGeneration(session), b = beginGeneration(session), c = beginGeneration(extra), d = beginGeneration(extra);
  const third = getSession(new NextRequest('http://localhost/api/grok', { headers: { cookie: `${SESSION_COOKIE}=${createSession('xai-third_test_secret_123456789')}` } }));
  assert.throws(() => beginGeneration(third), error => error.status === 429);
  a(); b(); c(); d(); a(); assert.equal(session.active, 0);
  for (let i=0;i<100;i++) limitSession(session);
  assert.throws(() => limitSession(session), error => error.status === 429);
});
test('JSON size checks count streamed bytes even without Content-Length; non-JSON is refused', async () => {
  const large = new NextRequest('http://localhost/api/grok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: '1234567890' }) });
  await assert.rejects(readBoundedJson(large, 8), error => error.status === 413);
  const claimed = new NextRequest('http://localhost/api/grok', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '1000' }, body: '{}' });
  await assert.rejects(readBoundedJson(claimed, 8), error => error.status === 413);
  await assert.rejects(readBoundedJson(new NextRequest('http://localhost/api/grok', { method: 'POST', body: '{}' })), error => error.status === 415);
});
test('API errors and debug data redact credentials and session tokens', async () => {
  const secret = 'xai-private_test_secret_123456789';
  const safe = redactSecrets({ error: `Error Bearer ${secret}`, nested: { api_key: secret, token: 'ephemeral' }, array: [secret] });
  assert.equal(JSON.stringify(safe).includes(secret), false); assert.equal(safe.nested.token, '[redacted]');
  global.fetch = async () => new Response(JSON.stringify({ error: `Bad key ${secret}` }), { status: 401 });
  const failed = await POST(request(input('grok-tts'))); assert.equal(failed.status, 401); assert.equal((await failed.text()).includes(secret), false);
});
test('Production CSP uses unique nonces, forbids inline scripts, frames and objects', () => {
  const { proxy } = compiled('proxy.js');
  const a = proxy(new NextRequest('https://localhost/')), b = proxy(new NextRequest('https://localhost/'));
  assert.notEqual(a.headers.get('content-security-policy'), b.headers.get('content-security-policy'));
  const script = a.headers.get('content-security-policy').split(';').find(part => part.includes('script-src'));
  assert.match(script, /nonce-/); assert.match(script, /strict-dynamic/); assert.doesNotMatch(script, /unsafe-inline/);
  const connect = a.headers.get('content-security-policy').split(';').find(part => part.trim().startsWith('connect-src'));
  assert.ok(connect.split(/\s+/).includes('https://pulse.lens4web.com'));
  assert.ok(!connect.split(/\s+/).includes('https:'));
  assert.match(a.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(a.headers.get('x-content-type-options'), 'nosniff'); assert.equal(a.headers.get('referrer-policy'), 'no-referrer');
  const api = proxy(new NextRequest('https://localhost/api/session'));
  assert.equal(api.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(a.headers.get('x-robots-tag'), null);
});
test('Executable data URLs and credential-bearing URLs are rejected for media', () => {
  for (const value of [{data:[{url:'javascript:alert(1)'}]}, {data:[{b64_json:'aGVsbG8=',mime_type:'text/html'}]}, {data:[{url:'https://user:secret@example.com/a.png'}]}, {data:[{url:'data:image/svg+xml;base64,aGVsbG8='}]}]) assert.throws(() => normalizeResponse('image', value));
});

test('Theme text palettes meet WCAG AA contrast on their actual surfaces', () => {
  const { readFileSync } = require('node:fs');
  const css = readFileSync(path.join(__dirname, '../src/app/globals.css'), 'utf8');
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  };
  const ratio = (a,b) => { const [low,high] = [luminance(a),luminance(b)].sort((a,b)=>a-b); return (high+0.05)/(low+0.05); };
  for (const block of [css.match(/:root \{([^}]+)\}/)[1],css.match(/:root\[data-theme="dark"\] \{([^}]+)\}/)[1]]) {
    const colors=Object.fromEntries([...block.matchAll(/--([\w-]+): (#[\da-f]{6})/g)].map(m=>[m[1],m[2]]));
    for (const fg of ['ink','ink-2','muted','subtle','blue','red','green','amber']) for (const bg of ['canvas','surface','surface-2']) assert.ok(ratio(colors[fg],colors[bg])>=4.5, `${fg} / ${bg} has contrast ${ratio(colors[fg],colors[bg])}`);
    for (const bg of ['canvas','surface','surface-2']) assert.ok(ratio(colors.border,colors[bg])>=3, `Control border / ${bg}`);
  }
});
test('Production API fails closed without APP_ORIGIN and denies an unexpected origin', () => {
  const security = compiled('lib/security.js');
  const oldNodeEnv = process.env.NODE_ENV, oldOrigin = process.env.APP_ORIGIN;
  try {
    process.env.NODE_ENV='production'; delete process.env.APP_ORIGIN;
    assert.throws(()=>security.requireSameOrigin(sessionRequest), error=>error.status===503);
    process.env.APP_ORIGIN='https://grok.example.com';
    assert.throws(()=>security.requireSameOrigin(sessionRequest), error=>error.status===403);
    const valid = new NextRequest('http://internal:3000/api/grok', { headers: {...securityHeaders, origin:'https://grok.example.com'} });
    assert.doesNotThrow(()=>security.requireSameOrigin(valid));
    assert.equal(security.sessionCookieName(valid),'__Host-grok_session');
  } finally { if(oldNodeEnv===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=oldNodeEnv; if(oldOrigin===undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN=oldOrigin; }
});
test('Connection attempts are limited before key verification and return Retry-After', async () => {
  const sessionRoute = compiled('app/api/session/route.js');
  global.fetch = () => assert.fail('Malformed connections must not reach xAI');
  let blocked = false;
  for (let i = 0; i < 21; i++) {
    const response = await sessionRoute.POST(new NextRequest('http://localhost/api/session', { method: 'POST', headers: { ...securityHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'malformed' }) }));
    if (response.status === 429) { blocked = true; assert.equal(response.headers.get('retry-after'), '60'); }
    else assert.equal(response.status, 400);
  }
  assert.ok(blocked);
});
test('Interrupted uploads fail before processing any payload', async () => {
  const abort = new AbortController(); abort.abort();
  const req = new NextRequest('http://localhost/api/grok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: abort.signal });
  await assert.rejects(readBoundedJson(req), error => error.status === 408);
});

const assetUrl = 'https://vidgen.x.ai/xai-vidgen-bucket/xai-video-cb3a83ec-322f-4318-990d-166bab11d328.mp4';
const mp4 = Buffer.from('0000ftypmp42');
test('Secret redaction preserves official generated video paths and still removes credentials', () => {
  assert.equal(redactSecrets(assetUrl), assetUrl);
  assert.equal(redactSecrets(assetUrl + '?key=xai-private_secret_123456'), assetUrl + '?key=[redacted]');
  assert.match(redactSecrets(assetUrl.replace('vidgen.x.ai', 'evil.example')), /redacted/);
  assert.equal(redactSecrets('Bearer xai-vidgen-bucket'), '[redacted]');
  assert.equal(redactSecrets(assetUrl, 'xai-vidgen-bucket').includes('xai-vidgen-bucket'), false);
});
test('Video status preserves real CDN URL and authenticated download returns MP4 without leaking key', async () => {
  getSession(sessionRequest).jobs.add('media-job');
  global.fetch = async (url, init) => {
    if (url.startsWith('https://api.x.ai/')) return fixture({ status: 'done', video: { url: assetUrl } });
    assert.equal(url, assetUrl); assert.equal(init.headers, undefined); assert.equal(init.redirect, 'error');
    return new Response(mp4, { headers: { 'content-type': 'application/octet-stream' } });
  };
  const make = action => new NextRequest(`http://localhost/api/grok?request_id=media-job${action}`, { headers: securityHeaders });
  assert.equal((await (await GET(make(''))).json()).result.content, assetUrl);
  const response = await GET(make('&action=download'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp4);
});
test('Video download rejects foreign jobs and unsafe upstream destinations before any CDN fetch', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return fixture({ status: 'done', video: { url: 'https://127.0.0.1/private.mp4' } }); };
  const req = id => new NextRequest(`http://localhost/api/grok?action=download&request_id=${id}`, { headers: securityHeaders });
  assert.equal((await GET(req('foreign-media'))).status, 403); assert.equal(calls, 0);
  getSession(sessionRequest).jobs.add('unsafe-media');
  assert.equal((await GET(req('unsafe-media'))).status, 502); assert.equal(calls, 1);
});
test('Video fetch rejects HTML, empty and oversized media; handles temporary and permanent 404', async () => {
  const { downloadVideo, MAX_VIDEO_BYTES } = compiled('lib/video.js');
  for (const response of [new Response('<html>Error</html>'), new Response(''), new Response(mp4, { headers: { 'content-length': String(MAX_VIDEO_BYTES + 1) } })]) {
    global.fetch = async () => response;
    await assert.rejects(downloadVideo(assetUrl, new AbortController().signal));
  }
  let calls = 0;
  global.fetch = async () => ++calls === 1 ? new Response('', { status: 404 }) : new Response(mp4);
  assert.deepEqual(Buffer.from(await downloadVideo(assetUrl, new AbortController().signal)), mp4); assert.equal(calls, 2);
  calls = 0; global.fetch = async () => { calls++; return new Response('', { status: 404 }); };
  await assert.rejects(downloadVideo(assetUrl, new AbortController().signal), /HTTP 404/); assert.equal(calls, 3);
});
test('Client does not report success when completed video cannot be downloaded', async () => {
  const { pollVideo } = compiled('lib/client.js');
  global.fetch = async url => url.includes('action=download') ? new Response(JSON.stringify({ error: 'Video HTTP 404' }), { status: 502, headers: { 'content-type': 'application/json' } }) : fixture({ result: { type: 'video', content: assetUrl } });
  await assert.rejects(pollVideo('job', new AbortController().signal, () => {}), /Video HTTP 404/);
});

const imageAsset = 'https://imgen.x.ai/xai-imgen/xai-tmp-imgen-a73bae6f-5a65-4bec-9ffb-8220caa3fa61.jpeg';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9FoAAAAASUVORK5CYII=', 'base64');
test('Shared server/client redactor preserves image paths but redacts queries and spoofed hosts', () => {
  assert.equal(redactSecrets(imageAsset), imageAsset);
  assert.equal(redactSecrets(imageAsset + '?key=xai-tmp-imgen-a73bae6f-5a65-4bec-9ffb-8220caa3fa61'), imageAsset + '?key=[redacted]');
  assert.match(redactSecrets(imageAsset.replace('imgen.x.ai', 'imgen.x.ai.evil.test')), /redacted/);
});
for (const model of xaiModels.filter(m => m.outputModalities.includes('IMAGE'))) {
  test(`${model.id}: URL/base64 generation and edit return actual images without CDN authorization`, async () => {
    for (const responseFormat of ['url', 'b64_json']) for (const files of [[], [image()]]) {
      let cdnCalls = 0;
      global.fetch = async (url, init) => {
        if (url.startsWith('https://api.x.ai/')) {
          assert.equal(url, files.length ? 'https://api.x.ai/v1/images/edits' : 'https://api.x.ai/v1/images/generations');
          assert.equal(JSON.parse(init.body).response_format, responseFormat);
          return fixture({ data: responseFormat === 'url' ? [{ url: imageAsset }, { url: imageAsset }] : [{ b64_json: png.toString('base64'), mime_type: 'image/png' }] });
        }
        cdnCalls++; assert.equal(url, imageAsset); assert.equal(init.headers, undefined); assert.equal(init.redirect, 'error');
        return new Response(png, { headers: { 'content-type': 'image/png' } });
      };
      const response = await POST(request(input(model.id, { files, parameters: { response_format: responseFormat } })));
      assert.equal(response.status, 200);
      const result = (await response.json()).result;
      assert.equal(result.content, `data:image/png;base64,${png.toString('base64')}`);
      assert.equal(result.urls.length, responseFormat === 'url' ? 2 : 1); assert.equal(cdnCalls, responseFormat === 'url' ? 2 : 0);
      if (responseFormat === 'url') assert.equal(result.sourceUrl, imageAsset);
    }
  });
}
test('Image responses reject unavailable files, HTML, unsafe hosts and malformed base64', async () => {
  const { receiveImages } = compiled('lib/images.js');
  const result = content => ({ type: 'image', content });
  global.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(receiveImages(result(imageAsset), new AbortController().signal), /HTTP 404/);
  global.fetch = async () => new Response('<html>error</html>', { headers: { 'content-type': 'image/jpeg' } });
  await assert.rejects(receiveImages(result(imageAsset), new AbortController().signal), /некорректный/);
  await assert.rejects(receiveImages(result('https://127.0.0.1/private'), new AbortController().signal), /недопустимый/);
  await assert.rejects(receiveImages(result('data:image/png;base64,A'), new AbortController().signal), /base64/);
});
test('Image download validates stream size even without Content-Length', async () => {
  const { readMediaBytes } = compiled('lib/media.js');
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(10)); controller.enqueue(new Uint8Array(10)); controller.close(); } });
  await assert.rejects(readMediaBytes(new Response(body), 15, new AbortController().signal), /лимит/);
});
test('Image client creates local files without remote fetch and revokes partial results on failure', async () => {
  const { localizeImages } = compiled('lib/client.js');
  const source = `data:image/png;base64,${png.toString('base64')}`;
  global.fetch = realFetch;
  const result = await localizeImages({ type: 'image', content: source, urls: [source, source], sourceUrl: imageAsset }, new AbortController().signal);
  assert.equal(result.sourceUrl, imageAsset); assert.equal(result.urls.length, 2);
  for (const url of result.urls) { assert.match(url, /^blob:/); assert.deepEqual(Buffer.from(await (await realFetch(url)).arrayBuffer()), png); URL.revokeObjectURL(url); }
  await assert.rejects(localizeImages({ type: 'image', content: imageAsset }, new AbortController().signal), /Сервер/);
  const originalRevoke = URL.revokeObjectURL; let revoked = 0;
  URL.revokeObjectURL = url => { revoked++; originalRevoke(url); };
  try { await assert.rejects(localizeImages({ type: 'image', content: source, urls: [source, imageAsset] }, new AbortController().signal)); assert.equal(revoked, 1); }
  finally { URL.revokeObjectURL = originalRevoke; }
});
for (const model of xaiModels.filter(m => !m.outputModalities.includes('IMAGE') && !m.outputModalities.includes('VIDEO'))) {
  test(`${model.id}: output bytes or text are preserved through the response pipeline`, async () => {
    const kind = model.kind ?? 'chat';
    if (kind === 'realtime') {
      global.fetch = async () => fixture({ value: 'ephemeral-value', expires_at: 123 });
      assert.equal((await (await POST(request(input(model.id)))).json()).token, 'ephemeral-value');
    } else {
      const text = 'A valid answer with multilingual text: Привет, 世界';
      global.fetch = async () => fixture(kind === 'tts' ? { audio: 'AQID', content_type: 'audio/wav' } : { text });
      const result = await POST(request(input(model.id, kind === 'stt' ? { prompt: '', files: [audio] } : {})));
      assert.equal(result.status, 200);
      assert.equal((await result.json()).result.content, kind === 'tts' ? 'data:audio/wav;base64,AQID' : text);
    }
  });
}
test('Malformed JSON TTS audio cannot be presented as a successful audio result', () => {
  for (const value of ['https://evil.test/audio.mp3', 'AQ', '<html>']) assert.throws(() => normalizeResponse('tts', { audio: value }), /base64/);
});

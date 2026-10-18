import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  calculateWER,
  detectTranscriptDisfluencies,
  fetchLiveValidationSamples,
  parseDisfluencyAnnotations,
  scoreDisfluencies,
} from "../src/services/evaluation/disfluencyDatasetEvaluator";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("WER reports substitutions, deletions, insertions, and an uncapped standard ratio", () => {
  assert.deepEqual(calculateWER("a b c", "a d c e"), {
    wer: 0.6667,
    substitutions: 1,
    deletions: 0,
    insertions: 1,
    refCount: 3,
  });
  assert.deepEqual(calculateWER("one two three", "one three"), {
    wer: 0.3333,
    substitutions: 0,
    deletions: 1,
    insertions: 0,
    refCount: 3,
  });
  assert.equal(calculateWER("one", "one two three").wer, 2);
  assert.equal(calculateWER("", "words").wer, null);
});

test("annotation parser preserves each supported label type, including nested restart content", () => {
  const labels = parseDisfluencyAnnotations(
    "{D You know, } {F uh, } [ I + I ] <laughter> {C and }",
  );
  assert.deepEqual(labels.filledPauses, ["uh,"]);
  assert.deepEqual(labels.discourseMarkers, ["You know,"]);
  assert.deepEqual(labels.coordinatingConjunctions, ["and"]);
  assert.deepEqual(labels.restarts.map(({ reparandum, repair }) => [reparandum, repair]), [
    ["I", "I"],
  ]);
  assert.deepEqual(labels.nonSpeechEvents, ["laughter"]);
  assert.equal(labels.totalCount, 4);
});

test("lexical event scores match category and normalized label text against ground truth", () => {
  const groundTruth = parseDisfluencyAnnotations(
    "{D You know, } {F uh, } [ I + I ] <laughter>",
  );
  const detections = detectTranscriptDisfluencies("You know, uh, I I, laughter");
  assert.deepEqual(scoreDisfluencies(groundTruth, detections), {
    tp: 4,
    fp: 0,
    fn: 0,
    precision: 1,
    recall: 1,
    f1: 1,
  });

  const missed = scoreDisfluencies(groundTruth, detectTranscriptDisfluencies("well, hmm"));
  assert.equal(missed.tp, 0);
  assert.equal(missed.fp, 2);
  assert.equal(missed.fn, 4);
  assert.equal(missed.precision, 0);
  assert.equal(missed.recall, 0);
  assert.equal(missed.f1, 0);

  const partialGroundTruth = parseDisfluencyAnnotations("{F uh, } {D well } <laughter>");
  const partial = scoreDisfluencies(partialGroundTruth, detectTranscriptDisfluencies("uh um"));
  assert.deepEqual(partial, {
    tp: 1,
    fp: 1,
    fn: 2,
    precision: 0.5,
    recall: 0.3333,
    f1: 0.4,
  });
});

test("dataset loading uses the rows API length parameter and validates the live schema", async () => {
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(String(input));
    return new Response(JSON.stringify({
      rows: [{
        row_idx: 7,
        row: {
          audio: [{ src: "https://datasets-server.huggingface.co/cached-assets/audio.wav", type: "audio/wav" }],
          transcript_annotated: "{F uh, } Hello.",
          transcript_a: "Uh, hello.",
          transcript_b: "Hello.",
          transcript_c: "Hello.",
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const samples = await fetchLiveValidationSamples(1);
  assert.equal(requestedUrl?.searchParams.get("length"), "1");
  assert.equal(requestedUrl?.searchParams.has("limit"), false);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].id, "hf-disfluency-validation-7");
  assert.equal(samples[0].groundTruth.totalCount, 1);

  globalThis.fetch = async () => new Response(JSON.stringify({
    rows: [{ row_idx: 8, row: { transcript_a: "reference" } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(fetchLiveValidationSamples(1), /missing required transcript_annotated ground truth/);
});

test("dataset loading rejects invalid limits rather than silently changing them", async () => {
  await assert.rejects(fetchLiveValidationSamples(0), /integer between 1 and 10/);
  await assert.rejects(fetchLiveValidationSamples(11), /integer between 1 and 10/);
});

test("dataset loading retries transient Hugging Face server errors", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response("temporarily unavailable", { status: 503 });
    return new Response(JSON.stringify({
      rows: [{
        row_idx: 0,
        row: {
          audio: [{ src: "https://datasets-server.huggingface.co/cached-assets/audio.wav" }],
          transcript_annotated: "Hello.",
          transcript_a: "Hello.",
          transcript_b: "Hello.",
          transcript_c: "Hello.",
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const samples = await fetchLiveValidationSamples(1);
  assert.equal(calls, 2);
  assert.equal(samples[0].transcript_a, "Hello.");
});

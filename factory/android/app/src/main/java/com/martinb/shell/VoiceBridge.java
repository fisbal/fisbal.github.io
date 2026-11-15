package com.martinb.shell;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.util.Locale;
import java.util.Set;

/**
 * Apps with a narrator only (mb-config.json voice:true): window.MBVoice reads text aloud with the phone's own
 * text-to-speech engine, because Android's WebView has no speechSynthesis. Attached only to the app's own offline pages.
 *
 *   MBVoice.speak(text, lang, gender, pitch, rate, volume)  lang "fr-CA" / "en-US", gender "f" / "m"
 *   MBVoice.stop()
 *   The page is told through window.__mbVoice('start' | 'done').
 */
final class VoiceBridge {
    private final WebView web;
    private TextToSpeech tts;
    private volatile boolean ready;

    VoiceBridge(Context ctx, WebView web) {
        this.web = web;
        tts = new TextToSpeech(ctx.getApplicationContext(), status -> {
            ready = status == TextToSpeech.SUCCESS;
            if (!ready || tts == null) return;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                    tell("start");
                }

                @Override
                public void onDone(String id) {
                    tell("done");
                }

                @Override
                public void onError(String id) {
                    tell("done");
                }
            });
        });
    }

    @JavascriptInterface
    public boolean ready() {
        return ready;
    }

    @JavascriptInterface
    public void speak(String text, String lang, String gender, double pitch, double rate, double volume) {
        if (!ready || tts == null || text == null || text.isEmpty()) {
            tell("done");
            return;
        }
        try {
            Locale want = Locale.forLanguageTag(lang == null || lang.isEmpty() ? "fr-CA" : lang);
            int r = tts.setLanguage(want);
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(new Locale(want.getLanguage()));
            }
            // Some engines name their voices "…female…" / "…male…": use one when it exists, else the pitch does the work.
            Set<Voice> voices = tts.getVoices();
            if (voices != null && gender != null) {
                for (Voice v : voices) {
                    if (v == null || v.getLocale() == null || v.isNetworkConnectionRequired()) continue;
                    if (!v.getLocale().getLanguage().equals(want.getLanguage())) continue;
                    String n = v.getName() == null ? "" : v.getName().toLowerCase(Locale.ROOT);
                    boolean fem = n.contains("female");
                    boolean mal = !fem && n.contains("male");
                    if (("f".equals(gender) && fem) || ("m".equals(gender) && mal)) {
                        tts.setVoice(v);
                        break;
                    }
                }
            }
            tts.setPitch((float) pitch);
            tts.setSpeechRate((float) rate);
            Bundle b = new Bundle();
            b.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, (float) volume);
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, b, "mb") != TextToSpeech.SUCCESS) tell("done");
        } catch (Throwable t) {
            tell("done");
        }
    }

    @JavascriptInterface
    public void stop() {
        try {
            if (tts != null) tts.stop();
        } catch (Throwable ignored) {
        }
    }

    void shutdown() {
        try {
            if (tts != null) {
                tts.stop();
                tts.shutdown();
            }
        } catch (Throwable ignored) {
        }
        tts = null;
    }

    private void tell(final String what) {
        web.post(() -> {
            try {
                web.evaluateJavascript("window.__mbVoice&&window.__mbVoice('" + what + "')", null);
            } catch (Throwable ignored) {
            }
        });
    }
}

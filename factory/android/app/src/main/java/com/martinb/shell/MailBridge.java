package com.martinb.shell;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Office In 1 only (mb-config.json mail:true): window.MBMail lets In 1 Mail read and send real mail by IMAP/SMTP
 * with an app password, which a web page cannot do. Attached only to the app's own offline pages.
 *
 *   MBMail.call(id, cmd, argsJson)  runs MailEngine off the main thread, then calls
 *   window.__mbMailDone(id, ok, answerJsonOrError) in the page.
 */
final class MailBridge {
    private final WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(2);

    MailBridge(WebView web) {
        this.web = web;
    }

    @JavascriptInterface
    public void call(final String id, final String cmd, final String argsJson) {
        pool.execute(() -> {
            boolean ok;
            String answer;
            try {
                answer = MailEngine.run(cmd, argsJson);
                ok = true;
            } catch (MailEngine.Fail f) {
                answer = f.getMessage();
                ok = false;
            } catch (Throwable t) {
                answer = "net: " + t.getClass().getSimpleName();
                ok = false;
            }
            final String js = "window.__mbMailDone&&window.__mbMailDone(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(answer) + ")";
            web.post(() -> web.evaluateJavascript(js, null));
        });
    }
}

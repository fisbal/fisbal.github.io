package com.martinb.shell;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Properties;
import java.util.Set;

import javax.mail.AuthenticationFailedException;
import javax.mail.Flags;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.MessagingException;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;

import com.sun.mail.imap.IMAPFolder;

/**
 * In 1 Mail's IMAP (RFC 9051/3501) and SMTP (RFC 5321) engine for the Android app: the same five calls, with the
 * same arguments and answers, as the Windows/Mac app's Rust engine (fisbal/oi1 src-tauri/src/mail.rs), so the web
 * code is identical. TLS only (IMAPS 993 / SMTPS 465, any other port = STARTTLS required), certificates checked by
 * Android. The password (an app password) arrives with each call and is never stored or logged here.
 * Plain Java (no Android class) so it can be tested on a computer against a real IMAP/SMTP server.
 */
final class MailEngine {
    static final int TIMEOUT_MS = 40000;
    /** Extra mail properties for tests only (e.g. trusting a test server's own certificate). */
    static Properties testProps = null;

    static final class Fail extends Exception {
        Fail(String msg) { super(msg); }
    }

    /** One call: cmd + JSON arguments → JSON answer (or Fail with "auth: …" / "net: …" / "bad …"). */
    static String run(String cmd, String argsJson) throws Fail {
        try {
            JSONObject a = new JSONObject(argsJson);
            JSONObject l = a.getJSONObject("login");
            Login login = new Login(l.getString("host"), l.getInt("port"), l.getString("user"), l.getString("pass"));
            switch (cmd) {
                case "mail_imap_check": check(login); return "null";
                case "mail_imap_fetch": {
                    JSONArray k = a.optJSONArray("known");
                    Set<String> known = new HashSet<>();
                    if (k != null) for (int i = 0; i < k.length(); i++) known.add(k.getString(i));
                    int max = Math.max(1, Math.min(200, a.optInt("max", 50)));
                    return fetch(login, known, max).toString();
                }
                case "mail_imap_seen": seen(login, uidOf(a.getString("remoteId"))); return "null";
                case "mail_imap_trash": trash(login, uidOf(a.getString("remoteId"))); return "null";
                case "mail_smtp_send": {
                    JSONArray t = a.getJSONArray("to");
                    List<String> to = new ArrayList<>();
                    for (int i = 0; i < t.length(); i++) to.add(t.getString(i));
                    send(login, a.getString("from"), to, a.getString("raw"));
                    return "null";
                }
                default: throw new Fail("bad command");
            }
        } catch (Fail f) {
            throw f;
        } catch (AuthenticationFailedException e) {
            throw new Fail("auth: " + msg(e));
        } catch (MessagingException e) {
            String m = msg(e);
            if (m.contains("535") || m.toLowerCase().contains("authenticat") || m.contains("AUTHENTICATIONFAILED")) throw new Fail("auth: " + m);
            throw new Fail("net: " + m);
        } catch (org.json.JSONException | IllegalArgumentException e) {
            throw new Fail("bad request: " + msg(e));
        } catch (Exception e) {
            throw new Fail("net: " + msg(e));
        }
    }

    private static String msg(Exception e) {
        String m = e.getMessage();
        Throwable c = e.getCause();
        if (c != null && c.getMessage() != null && (m == null || !m.contains(c.getMessage()))) m = (m == null ? "" : m + ": ") + c.getMessage();
        return m == null ? e.getClass().getSimpleName() : m;
    }

    static final class Login {
        final String host, user, pass;
        final int port;
        Login(String host, int port, String user, String pass) throws Fail {
            if (!host.contains(".") || !host.matches("[A-Za-z0-9.-]+")) throw new Fail("bad host");
            if (port < 1 || port > 65535) throw new Fail("bad port");
            this.host = host; this.port = port; this.user = user; this.pass = pass;
        }
    }

    private static Properties base(String proto) {
        Properties p = new Properties();
        String t = String.valueOf(TIMEOUT_MS);
        p.put("mail." + proto + ".connectiontimeout", t);
        p.put("mail." + proto + ".timeout", t);
        p.put("mail." + proto + ".writetimeout", t);
        p.put("mail." + proto + ".ssl.checkserveridentity", "true");
        if (testProps != null) p.putAll(testProps);
        return p;
    }

    private static Store open(Login l) throws MessagingException {
        Properties p = base("imaps");
        p.put("mail.imaps.peek", "true"); // reading never marks a mail as read (BODY.PEEK)
        Store s = Session.getInstance(p).getStore("imaps");
        s.connect(l.host, l.port, l.user, l.pass);
        return s;
    }

    private static void close(Store s) {
        try { s.close(); } catch (Exception ignored) { }
    }

    static void check(Login l) throws MessagingException {
        close(open(l));
    }

    /** The newest `max` mails of INBOX not in `known` ("uidvalidity:uid"), each as the whole message in base64. */
    static JSONArray fetch(Login l, Set<String> known, int max) throws Exception {
        Store s = open(l);
        try {
            IMAPFolder inbox = (IMAPFolder) s.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            long validity = inbox.getUIDValidity();
            int n = inbox.getMessageCount();
            JSONArray out = new JSONArray();
            if (n > 0) {
                Message[] msgs = inbox.getMessages(Math.max(1, n - max + 1), n);
                javax.mail.FetchProfile fp = new javax.mail.FetchProfile();
                fp.add(javax.mail.UIDFolder.FetchProfileItem.UID);
                fp.add(javax.mail.FetchProfile.Item.FLAGS);
                inbox.fetch(msgs, fp);
                for (int i = msgs.length - 1; i >= 0; i--) {
                    Message m = msgs[i];
                    String id = validity + ":" + inbox.getUID(m);
                    if (known.contains(id)) continue;
                    ByteArrayOutputStream raw = new ByteArrayOutputStream();
                    m.writeTo(raw);
                    JSONObject r = new JSONObject();
                    r.put("remoteId", id);
                    r.put("raw", new String(com.sun.mail.util.BASE64EncoderStream.encode(raw.toByteArray()), java.nio.charset.StandardCharsets.US_ASCII).replaceAll("\\s", ""));
                    r.put("unread", !m.isSet(Flags.Flag.SEEN));
                    out.put(r);
                }
            }
            inbox.close(false);
            return out;
        } finally {
            close(s);
        }
    }

    static long uidOf(String remoteId) throws Fail {
        String u = remoteId.substring(remoteId.lastIndexOf(':') + 1);
        if (u.isEmpty() || !u.matches("[0-9]+")) throw new Fail("bad id");
        return Long.parseLong(u);
    }

    static void seen(Login l, long uid) throws Exception {
        Store s = open(l);
        try {
            IMAPFolder inbox = (IMAPFolder) s.getFolder("INBOX");
            inbox.open(Folder.READ_WRITE);
            Message m = inbox.getMessageByUID(uid);
            if (m != null) m.setFlag(Flags.Flag.SEEN, true);
            inbox.close(false);
        } finally {
            close(s);
        }
    }

    /** Moves a mail to the server's Trash (the folder marked \Trash, RFC 6154), never erasing it for good. */
    static void trash(Login l, long uid) throws Exception {
        Store s = open(l);
        try {
            String trash = null, byName = null;
            for (Folder f : s.getDefaultFolder().list("*")) {
                for (String at : ((IMAPFolder) f).getAttributes()) if ("\\Trash".equalsIgnoreCase(at)) trash = f.getFullName();
                String n = f.getFullName().toLowerCase();
                if (byName == null && (n.equals("trash") || n.endsWith("/trash") || n.endsWith("/corbeille") || n.equals("deleted items") || n.equals("deleted messages"))) byName = f.getFullName();
            }
            if (trash == null) trash = byName;
            if (trash == null) throw new Fail("net: no trash");
            IMAPFolder inbox = (IMAPFolder) s.getFolder("INBOX");
            inbox.open(Folder.READ_WRITE);
            Message m = inbox.getMessageByUID(uid);
            if (m != null) {
                Folder dest = s.getFolder(trash);
                try {
                    inbox.moveMessages(new Message[]{m}, dest);
                } catch (MessagingException noMove) {
                    inbox.copyMessages(new Message[]{m}, dest);
                    m.setFlag(Flags.Flag.DELETED, true);
                    inbox.expunge(new Message[]{m});
                }
            }
            inbox.close(false);
        } finally {
            close(s);
        }
    }

    /** Sends a complete MIME message as it is (built by In 1 Mail, maybe OpenPGP-encrypted; no Bcc line). */
    static void send(Login l, String from, List<String> to, String rawB64) throws Exception {
        byte[] raw;
        raw = com.sun.mail.util.BASE64DecoderStream.decode(rawB64.replaceAll("\\s", "").getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        if (to.isEmpty()) throw new Fail("bad address: no recipient");
        boolean wrapped = l.port == 465;
        String proto = wrapped ? "smtps" : "smtp";
        Properties p = base(proto);
        p.put("mail." + proto + ".auth", "true");
        p.put("mail." + proto + ".from", new InternetAddress(from, true).getAddress());
        if (!wrapped) {
            p.put("mail.smtp.starttls.enable", "true");
            p.put("mail.smtp.starttls.required", "true");
            p.put("mail.smtp.ssl.checkserveridentity", "true");
        }
        Session session = Session.getInstance(p);
        MimeMessage msg = new MimeMessage(session, new ByteArrayInputStream(raw));
        InternetAddress[] rcpt = new InternetAddress[to.size()];
        for (int i = 0; i < rcpt.length; i++) rcpt[i] = new InternetAddress(to.get(i), true);
        Transport t = session.getTransport(proto);
        try {
            t.connect(l.host, l.port, l.user, l.pass);
            t.sendMessage(msg, rcpt);
        } finally {
            try { t.close(); } catch (Exception ignored) { }
        }
    }
}

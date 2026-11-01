package com.martinb.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.util.Log;
import android.widget.Toast;

/** Receives the result of an update install. If Android needs the user's OK (first update), it opens that screen. */
public class UpdateReceiver extends BroadcastReceiver {
    static Updater updater;

    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        Log.i(Updater.TAG, "install status " + status + " " + msg);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { context.startActivity(confirm); } catch (Exception e) { Log.w(Updater.TAG, "cannot open confirm screen: " + e); }
            }
            return;
        }
        boolean ok = status == PackageInstaller.STATUS_SUCCESS;
        if (updater != null) updater.installFinished(ok);
        if (!ok && status != PackageInstaller.STATUS_FAILURE_ABORTED) {
            Toast.makeText(context, "Mise à jour impossible pour l'instant, nouvel essai plus tard.", Toast.LENGTH_LONG).show();
        }
    }
}

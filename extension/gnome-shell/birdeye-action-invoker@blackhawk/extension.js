import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const NOTIFICATIONS_PATH = '/org/freedesktop/Notifications';
const NOTIFICATIONS_INTERFACE = 'org.freedesktop.Notifications';

const BirdeyeActionInvokerInterface = `
<node>
  <interface name="org.birdeye.ActionInvoker">
    <method name="InvokeAction">
      <arg name="notificationId" type="u" direction="in" />
      <arg name="actionKey" type="s" direction="in" />
      <arg name="success" type="b" direction="out" />
    </method>
  </interface>
</node>
`;

export default class BirdeyeActionInvoker {
    #dbus;

    enable() {
        this.#dbus = Gio.DBusExportedObject.wrapJSObject(
            BirdeyeActionInvokerInterface,
            this,
        );
        this.#dbus.export(
            Gio.DBus.session,
            '/org/birdeye/ActionInvoker',
        );
        log('Birdeye Action Invoker: D-Bus interface exported');
    }

    disable() {
        this.#dbus.unexport_from_connection(Gio.DBus.session);
        this.#dbus = undefined;
        log('Birdeye Action Invoker: D-Bus interface removed');
    }

    InvokeAction(notificationId, actionKey) {
        try {
            // The shell emits both signals when a notification is clicked, and
            // the front notification daemon forwards them to the app that sent
            // the notification. ActivationToken makes the app's window focus
            // request valid under Wayland (Switching to the window's workspace);
            // ActionInvoked delivers the click itself (opening the chat).
            this.#emitSignal('ActivationToken', new GLib.Variant('(us)', [
                notificationId,
                this.#createActivationToken(),
            ]));
            this.#emitSignal('ActionInvoked', new GLib.Variant('(us)', [
                notificationId,
                actionKey,
            ]));
            log(`Birdeye Action Invoker: emitted ActivationToken + ActionInvoked(${notificationId}, '${actionKey}')`);
            return true;
        } catch (e) {
            logError(e, 'Birdeye Action Invoker: failed to emit notification signals');
            return false;
        }
    }

    #createActivationToken() {
        // Mirrors MessageTray's FdoNotificationDaemonSource: a fresh xdg
        // activation token, without which the app cannot raise its window
        // across workspaces.
        const context = global.create_app_launch_context(0, -1);
        return context.get_startup_notify_id(null, []);
    }

    #emitSignal(signalName, params) {
        Gio.DBus.session.emit_signal(
            null,
            NOTIFICATIONS_PATH,
            NOTIFICATIONS_INTERFACE,
            signalName,
            params,
        );
    }
}

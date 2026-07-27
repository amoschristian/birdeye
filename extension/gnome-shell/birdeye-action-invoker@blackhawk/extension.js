import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

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
            // Emit the ActionInvoked signal on the org.freedesktop.Notifications
            // interface. The separate notification daemon GJS process listens
            // for this signal from org.gnome.Shell and proxies it to the
            // original notification sender (e.g., browser, Telegram).
            const params = new GLib.Variant('(us)', [notificationId, actionKey]);
            Gio.DBus.session.emit_signal(
                null,  // broadcast — daemon proxy picks it up
                '/org/freedesktop/Notifications',
                'org.freedesktop.Notifications',
                'ActionInvoked',
                params,
            );
            log(`Birdeye Action Invoker: emitted ActionInvoked(${notificationId}, '${actionKey}')`);
            return true;
        } catch (e) {
            logError(e, 'Birdeye Action Invoker: failed to emit ActionInvoked');
            return false;
        }
    }
}

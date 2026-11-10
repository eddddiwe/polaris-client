/*
 * Decompiled with CFR 0.152.
 */
package dev.polaris.config;

import java.util.UUID;

public final class PolarisProfile {
    private PolarisProfile() {
    }

    public static UUID id(Object object) {
        if (object == null) {
            return null;
        }
        Object object2 = PolarisProfile.invoke(object, "id");
        if (!(object2 instanceof UUID)) {
            object2 = PolarisProfile.invoke(object, "getId");
        }
        return object2 instanceof UUID ? (UUID)object2 : null;
    }

    public static String name(Object object) {
        if (object == null) {
            return null;
        }
        Object object2 = PolarisProfile.invoke(object, "name");
        if (!(object2 instanceof String)) {
            object2 = PolarisProfile.invoke(object, "getName");
        }
        return object2 instanceof String ? (String)object2 : null;
    }

    private static Object invoke(Object object, String string) {
        try {
            return object.getClass().getMethod(string, new Class[0]).invoke(object, new Object[0]);
        }
        catch (Throwable throwable) {
            return null;
        }
    }
}


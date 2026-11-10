/*
 * Decompiled with CFR 0.152.
 */
package dev.polaris.config;

import dev.polaris.config.PolarisProfile;
import dev.polaris.config.PolarisText;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

public final class PolarisBadges {
    private static final Set<String> badgedTab = new HashSet<String>();
    private static final Set<String> badgedWorld = new HashSet<String>();

    private PolarisBadges() {
    }

    public static void applyAsync(final Object object, final Set<String> set) {
        try {
            Method method = PolarisBadges.findExecute(object.getClass());
            if (method != null) {
                method.invoke(object, new Runnable(){

                    @Override
                    public void run() {
                        PolarisBadges.apply(object, set);
                    }
                });
            } else {
                PolarisBadges.apply(object, set);
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    private static void apply(Object object, Set<String> set) {
        String string;
        String string2;
        Object object2;
        Object object3;
        Object object4;
        Object object5;
        HashSet<String> hashSet = new HashSet<String>();
        for (String object62 : set) {
            hashSet.add(object62.toLowerCase(Locale.ROOT));
        }
        try {
            Object object6;
            object5 = PolarisBadges.invokeNoArg(object, "method_1562");
            if (object5 != null && (object6 = PolarisBadges.invokeNoArg(object5, "method_2880")) instanceof Collection) {
                for (Object e : (Collection)object6) {
                    try {
                        object4 = PolarisBadges.invokeNoArg(e, "method_2966");
                        object3 = PolarisProfile.id(object4);
                        object2 = PolarisProfile.name(object4);
                        if (object3 == null) continue;
                        string2 = ((UUID)object3).toString().toLowerCase(Locale.ROOT);
                        String string3 = string = object2 != null ? String.valueOf(object2) : string2;
                        if (hashSet.contains(string2)) {
                            badgedTab.add(string2);
                            PolarisBadges.setText(e, "method_2962", PolarisText.withIcon(string));
                            continue;
                        }
                        if (!badgedTab.remove(string2)) continue;
                        PolarisBadges.setText(e, "method_2962", null);
                    }
                    catch (Throwable throwable) {}
                }
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        try {
            object5 = PolarisBadges.fieldValue(object, "field_1687");
            if (object5 == null) {
                return;
            }
            Object object7 = PolarisBadges.invokeNoArg(object5, "method_18456");
            if (!(object7 instanceof List)) {
                return;
            }
            for (Object e : (List)object7) {
                try {
                    object4 = PolarisBadges.invokeNoArg(e, "method_5667");
                    if (!(object4 instanceof UUID)) continue;
                    object3 = object4.toString().toLowerCase(Locale.ROOT);
                    if (hashSet.contains(object3)) {
                        badgedWorld.add((String)object3);
                        object2 = PolarisBadges.invokeNoArg(e, "method_5797");
                        string2 = PolarisBadges.textString(object2, "");
                        if (object2 != null && string2.contains("[P]")) continue;
                        string = PolarisBadges.textString(PolarisBadges.invokeNoArg(e, "method_5477"), (String)object3);
                        PolarisBadges.setText(e, "method_5665", PolarisText.withIcon(string));
                        continue;
                    }
                    if (!badgedWorld.remove(object3)) continue;
                    PolarisBadges.setText(e, "method_5665", null);
                }
                catch (Throwable throwable) {}
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    private static void setText(Object object, String string, Object object2) {
        try {
            for (Method method : object.getClass().getMethods()) {
                if (!method.getName().equals(string) || method.getParameterCount() != 1) continue;
                method.invoke(object, object2);
                return;
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    private static Object invokeNoArg(Object object, String string) {
        if (object == null) {
            return null;
        }
        try {
            return object.getClass().getMethod(string, new Class[0]).invoke(object, new Object[0]);
        }
        catch (Throwable throwable) {
            return null;
        }
    }

    private static String textString(Object object, String string) {
        if (object == null) {
            return string;
        }
        try {
            Object object2 = object.getClass().getMethod("getString", new Class[0]).invoke(object, new Object[0]);
            if (object2 instanceof String) {
                return (String)object2;
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        return string;
    }

    private static Object fieldValue(Object object, String string) {
        try {
            for (Class<?> clazz = object.getClass(); clazz != null; clazz = clazz.getSuperclass()) {
                for (Field field : clazz.getDeclaredFields()) {
                    if (!field.getName().equals(string)) continue;
                    field.setAccessible(true);
                    return field.get(object);
                }
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        return null;
    }

    private static Method findExecute(Class<?> clazz) {
        try {
            return clazz.getMethod("execute", Runnable.class);
        }
        catch (NoSuchMethodException noSuchMethodException) {
            return null;
        }
    }
}


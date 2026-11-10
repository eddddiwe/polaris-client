/*
 * Decompiled with CFR 0.152.
 */
package dev.polaris.config;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

final class PolarisFlatText {
    private static final Map<Class<?>, Method> RESOLVED = new HashMap();
    private static final Set<Class<?>> UNAVAILABLE = new HashSet();
    private static final String[] CANDIDATES = new String[]{"method_51433", "drawText", "drawString"};

    private PolarisFlatText() {
    }

    static boolean draw(Object object, Object object2, String string, int n, int n2, int n3) {
        if (object == null || object2 == null) {
            return false;
        }
        Class<?> clazz = object.getClass();
        Method method = RESOLVED.get(clazz);
        if (method == null) {
            if (UNAVAILABLE.contains(clazz)) {
                return false;
            }
            method = PolarisFlatText.find(clazz, object2);
            if (method == null) {
                UNAVAILABLE.add(clazz);
                return false;
            }
            method.setAccessible(true);
            RESOLVED.put(clazz, method);
        }
        try {
            method.invoke(object, object2, string, n, n2, n3, Boolean.FALSE);
            return true;
        }
        catch (Throwable throwable) {
            RESOLVED.remove(clazz);
            UNAVAILABLE.add(clazz);
            return false;
        }
    }

    private static Method find(Class<?> clazz, Object object) {
        Method[] methodArray;
        try {
            methodArray = clazz.getMethods();
        }
        catch (Throwable throwable) {
            return null;
        }
        for (Method method : methodArray) {
            Class<?>[] classArray;
            if (method.getParameterTypes().length != 6 || (classArray = method.getParameterTypes())[1] != String.class || classArray[2] != Integer.TYPE || classArray[3] != Integer.TYPE || classArray[4] != Integer.TYPE || classArray[5] != Boolean.TYPE || !classArray[0].isInstance(object)) continue;
            for (String string : CANDIDATES) {
                if (!method.getName().equals(string)) continue;
                return method;
            }
        }
        return null;
    }
}


/*
 * Decompiled with CFR 0.152.
 */
package dev.polaris.config;

import java.lang.reflect.Method;

public final class PolarisText {
    private static Class<?> textClass;
    private static Method literalMethod;

    private PolarisText() {
    }

    public static Class<?> textClass() throws Exception {
        if (textClass == null) {
            try {
                textClass = Class.forName("net.minecraft.class_2561");
                literalMethod = textClass.getMethod("method_43470", String.class);
            }
            catch (ClassNotFoundException classNotFoundException) {
                textClass = Class.forName("net.minecraft.network.chat.Component");
                literalMethod = textClass.getMethod("literal", String.class);
            }
        }
        return textClass;
    }

    public static Object literal(String string) throws Exception {
        PolarisText.textClass();
        return literalMethod.invoke(null, string);
    }

    public static Object withIcon(String string) throws Exception {
        return PolarisText.literal(string + " [P]");
    }

    public static Object prefixIcon(Object object) throws Exception {
        Object object2 = PolarisText.literal("[P] ");
        Method method = null;
        for (Method method2 : object2.getClass().getMethods()) {
            if (method2.getParameterCount() != 1 || !method2.getParameterTypes()[0].isAssignableFrom(object.getClass()) || !method2.getName().equals("method_10852") && !method2.getName().equals("append")) continue;
            method = method2;
            break;
        }
        return method == null ? object : method.invoke(object2, object);
    }

    public static Object identifier(String string, String string2) throws Exception {
        try {
            Class<?> clazz = Class.forName("net.minecraft.class_2960");
            return clazz.getMethod("method_60655", String.class, String.class).invoke(null, string, string2);
        }
        catch (ClassNotFoundException classNotFoundException) {
            Class<?> clazz = Class.forName("net.minecraft.resources.Identifier");
            return clazz.getMethod("fromNamespaceAndPath", String.class, String.class).invoke(null, string, string2);
        }
    }
}


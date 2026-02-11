import React, { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { Text } from "@/components/Themed";

type Props = {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
};

export default function SlideToConfirm({ label, onComplete, disabled, variant = "default" }: Props) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const trackBg = theme.card;
  const trackBorder = theme.border;
  const thumbBg = variant === "danger" ? theme.danger : theme.primary;
  const thumbIcon = "#fff";
  const labelColor = variant === "danger" ? theme.danger : theme.text;
  const chevronColor = theme.textSecondary;

  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const completeOnceRef = useRef(false);
  const dragStartX = useRef(0);

  const { thumbSize, padding, maxTranslateX } = useMemo(() => {
    const thumbSize = 56;
    const padding = 6;
    const maxTranslateX = Math.max(0, trackWidth - thumbSize - padding * 2);
    return { thumbSize, padding, maxTranslateX };
  }, [trackWidth]);

  const labelOpacity = translateX.interpolate({
    inputRange: [0, Math.max(1, maxTranslateX * 0.6)],
    outputRange: [1, 0.25],
    extrapolate: "clamp",
  });

  const chevronOpacity = translateX.interpolate({
    inputRange: [0, Math.max(1, maxTranslateX * 0.25)],
    outputRange: [0.9, 0.2],
    extrapolate: "clamp",
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !disabled && Math.abs(gestureState.dx) > 2 && Math.abs(gestureState.dy) < 12,
        onPanResponderGrant: () => {
          translateX.stopAnimation((value) => {
            dragStartX.current = typeof value === "number" ? value : 0;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const next = Math.min(
            maxTranslateX,
            Math.max(0, dragStartX.current + gestureState.dx)
          );
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, gestureState) => {
          const projected = Math.min(
            maxTranslateX,
            Math.max(0, dragStartX.current + gestureState.dx)
          );
          const shouldComplete = maxTranslateX > 0 && projected >= maxTranslateX * 0.9;

          Animated.spring(translateX, {
            toValue: shouldComplete ? maxTranslateX : 0,
            useNativeDriver: true,
            friction: 9,
            tension: 80,
          }).start(({ finished }) => {
            if (!finished) return;
            if (shouldComplete && !completeOnceRef.current) {
              completeOnceRef.current = true;
              onComplete();
              // If navigation doesn't unmount immediately, reset for safety.
              requestAnimationFrame(() => {
                completeOnceRef.current = false;
                translateX.setValue(0);
              });
            }
          });
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 9,
            tension: 80,
          }).start();
        },
      }),
    [disabled, maxTranslateX, onComplete, translateX]
  );

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[
        styles.track,
        {
          backgroundColor: trackBg,
          borderColor: trackBorder,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Animated.View style={[styles.labelWrap, { opacity: labelOpacity }]}>
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      </Animated.View>

      <Animated.View style={[styles.chevronsWrap, { opacity: chevronOpacity }]}>
        <FontAwesome name="angle-right" size={18} color={chevronColor} />
        <FontAwesome name="angle-right" size={18} color={chevronColor} />
        <FontAwesome name="angle-right" size={18} color={chevronColor} />
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.thumb,
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            backgroundColor: thumbBg,
            transform: [{ translateX }],
            left: padding,
            top: padding,
          },
        ]}
      >
        <FontAwesome name="arrow-right" size={18} color={thumbIcon} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 68,
    borderRadius: 18,
    borderWidth: 1,
    width: 300,
    justifyContent: "center",
    overflow: "hidden",
  },
  labelWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  chevronsWrap: {
    position: "absolute",
    right: 18,
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
  },
  thumb: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
});


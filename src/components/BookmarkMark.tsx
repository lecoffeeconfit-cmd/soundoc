import { StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';

type BookmarkMarkVariant = 'single' | 'save' | 'collection';

export function BookmarkMark({ size = 18, color = colors.accentPrimary, variant = 'single' }: { size?: number; color?: string; variant?: BookmarkMarkVariant }) {
  const width = size * 0.7;
  const plusSize = Math.max(6, size * 0.34);

  return <View style={{ width: variant === 'collection' ? size * 0.98 : width, height: size * 1.12 }} pointerEvents="none">
    <BookmarkShape size={size} color={color} left={0} top={0} />
    {variant === 'collection' && <>
      <View style={[styles.collectionLine, { width: size * 0.24, height: Math.max(1.3, size * 0.09), backgroundColor: color, right: 0, top: size * 0.3 }]} />
      <View style={[styles.collectionLine, { width: size * 0.24, height: Math.max(1.3, size * 0.09), backgroundColor: color, right: 0, top: size * 0.5 }]} />
    </>}
    {variant === 'save' && <View style={[styles.addMark, { width: plusSize, height: plusSize, right: -size * 0.08, top: size * 0.17 }]}><View style={[styles.addBar, { width: plusSize, height: Math.max(1.3, size * 0.09), backgroundColor: color }]} /><View style={[styles.addBar, { width: Math.max(1.3, size * 0.09), height: plusSize, backgroundColor: color }]} /></View>}
  </View>;
}

function BookmarkShape({ size, color, left, top, opacity = 1 }: { size: number; color: string; left: number; top: number; opacity?: number }) {
  const width = size * 0.7;
  const stroke = Math.max(1.3, size * 0.09);
  const tailWidth = width * 0.64;

  return <View style={{ position: 'absolute', width, height: size * 1.12, left, top, opacity }}>
    <View style={[styles.body, { width, height: size, borderColor: color, borderWidth: stroke, borderBottomWidth: 0, borderTopLeftRadius: size * 0.16, borderTopRightRadius: size * 0.16 }]} />
    <View style={[styles.tail, { width: tailWidth, height: stroke, backgroundColor: color, left: -stroke * 0.2, bottom: size * 0.08, transform: [{ rotate: '34deg' }] }]} />
    <View style={[styles.tail, { width: tailWidth, height: stroke, backgroundColor: color, right: -stroke * 0.2, bottom: size * 0.08, transform: [{ rotate: '-34deg' }] }]} />
  </View>;
}

const styles = StyleSheet.create({
  body: { position: 'absolute', top: 0 },
  tail: { position: 'absolute', borderRadius: 99 },
  addMark: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  addBar: { position: 'absolute', borderRadius: 99 },
  collectionLine: { position: 'absolute', borderRadius: 99 },
});

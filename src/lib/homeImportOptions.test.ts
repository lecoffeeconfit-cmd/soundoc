import { createHomeImportActions, getHomeImportBorderTreatment, HOME_HERO_LAYOUT, HOME_IMPORT_LAYOUT, QUICK_READ_GUIDE_STEPS } from './homeImportOptions';

export function runHomeImportOptionFixtures() {
  const calls: string[] = [];
  const actions = createHomeImportActions({
    openWeb: () => calls.push('web'),
    openQuickRead: () => calls.push('quick-read'),
    openDocuments: () => calls.push('documents'),
    openText: () => calls.push('text'),
  });

  const visibleCopy = actions.map(({ title, description }) => `${title}|${description}`);
  const expectedCopy = [
    'Web Article or Link|Articles & direct document links',
    'Share to Soundoc|Send pages from Safari, Chrome & more',
    'PDF & Documents|Books, textbooks & large documents',
    'Paste Text|Long manuscripts welcome',
  ];
  if (JSON.stringify(visibleCopy) !== JSON.stringify(expectedCopy)) {
    throw new Error('Home import options must retain the approved order and user-facing descriptions');
  }

  actions.forEach((action) => action.onPress());
  if (calls.join(',') !== 'web,quick-read,documents,text') {
    throw new Error('Each Home import card must invoke its intended existing flow');
  }

  const share = actions[1];
  if (share.accessibilityLabel !== 'Learn how to share webpages to Soundoc') {
    throw new Error('Share to Soundoc must describe its instructional action to VoiceOver');
  }
  if (!share.isNew || share.primary) {
    throw new Error('Share to Soundoc should be discoverable without replacing Web Link as the primary action');
  }
  if (!actions[0].primary || actions.slice(1).some((action) => action.primary)) {
    throw new Error('Web Article or Link must remain the only primary import card');
  }

  if (HOME_IMPORT_LAYOUT.minHeight < 44 || HOME_IMPORT_LAYOUT.minHeight > 72 || HOME_IMPORT_LAYOUT.height !== HOME_IMPORT_LAYOUT.minHeight) {
    throw new Error('Home import cards must share one comfortable fixed height');
  }
  if (HOME_IMPORT_LAYOUT.gap < 12 || HOME_IMPORT_LAYOUT.gap > 14) {
    throw new Error('Home import spacing must stay within the approved 12–14 point rhythm');
  }
  if (HOME_IMPORT_LAYOUT.iconSize < 40) {
    throw new Error('Home import icons must remain legible after compaction');
  }

  const guide = QUICK_READ_GUIDE_STEPS.map(({ title, detail }) => `${title}|${detail}`);
  const expectedGuide = [
    'Open a webpage|Use Safari, Chrome, or another browser.',
    'Tap Share|Choose the arrow-up-from-box button in your browser.',
    'Choose Soundoc|Soundoc prepares the page and adds it to your Library.',
  ];
  if (JSON.stringify(guide) !== JSON.stringify(expectedGuide)) {
    throw new Error('The Home guide must teach Browser to Share to Soundoc without implying an in-app import');
  }

  const reclaimedVerticalSpace = (20 - HOME_HERO_LAYOUT.topPadding)
    + (34 - HOME_HERO_LAYOUT.brandBottomSpacing)
    + (42 - HOME_HERO_LAYOUT.titleLineHeight)
    + (16 - HOME_HERO_LAYOUT.continueDividerTopSpacing)
    + (12 - HOME_HERO_LAYOUT.continueTitleTopSpacing);
  if (reclaimedVerticalSpace < 24 || reclaimedVerticalSpace > 32) {
    throw new Error('Home hero compaction must reveal Continue Listening without making the page feel cramped');
  }
  if (HOME_HERO_LAYOUT.titleFontSize <= 21 || HOME_HERO_LAYOUT.titleLineHeight <= 27) {
    throw new Error('Listen to anything must remain clearly larger than the Continue Listening heading');
  }

  const [webBorder, shareBorder, documentsBorder, textBorder] = actions.map(getHomeImportBorderTreatment);
  if (webBorder !== undefined) {
    throw new Error('Web Article or Link must retain its existing primary border styling');
  }
  if (!documentsBorder || !textBorder || documentsBorder.borderWidth !== 1 || textBorder.borderWidth !== 1) {
    throw new Error('PDF and Paste Text must use the slightly clearer neutral one-point outline');
  }
  if (documentsBorder.borderColor !== 'rgba(154,160,168,0.14)' || textBorder.borderColor !== documentsBorder.borderColor) {
    throw new Error('Secondary import cards must share the approved neutral charcoal-gray outline');
  }
  if (!shareBorder || shareBorder.borderWidth !== 1 || shareBorder.borderColor !== 'rgba(255,113,56,0.16)') {
    throw new Error('Share to Soundoc must use the faint approved warm outline');
  }
  if (Number(shareBorder.borderColor.match(/([\d.]+)\)$/)?.[1]) >= 0.19) {
    throw new Error('Share to Soundoc must remain warmer than neutral cards and much subtler than the primary Web card');
  }
}

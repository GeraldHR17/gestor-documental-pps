---
name: High-Contrast Civic Modern
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#5e3f3a'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#936e69'
  outline-variant: '#e8bdb6'
  surface-tint: '#c00002'
  primary: '#a60001'
  on-primary: '#ffffff'
  primary-container: '#d30505'
  on-primary-container: '#ffe3de'
  inverse-primary: '#ffb4a8'
  secondary: '#595f64'
  on-secondary: '#ffffff'
  secondary-container: '#dde3e8'
  on-secondary-container: '#5f656a'
  tertiary: '#4e5156'
  on-tertiary: '#ffffff'
  tertiary-container: '#66696e'
  on-tertiary-container: '#e8e9ef'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930001'
  secondary-fixed: '#dde3e8'
  secondary-fixed-dim: '#c1c7cc'
  on-secondary-fixed: '#161c20'
  on-secondary-fixed-variant: '#41484c'
  tertiary-fixed: '#e1e2e8'
  tertiary-fixed-dim: '#c4c6cc'
  on-tertiary-fixed: '#191c20'
  on-tertiary-fixed-variant: '#44474c'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  deep-onyx: '#0A0C11'
  surface-alt: '#F0F0F1'
  pure-white: '#FFFFFF'
typography:
  headline-lg:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Public Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Public Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Public Sans
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.55'
  body-md:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter-sm: 16px
  gutter-lg: 24px
  margin-mobile: 16px
  margin-desktop: 24px
  touch-target: 44px
---

## Brand & Style

This design system is engineered for institutional clarity and high-impact civic engagement. The brand personality is authoritative, decisive, and highly accessible, moving away from soft earth tones toward a bold, high-contrast aesthetic. It evokes a sense of urgency and official presence, suitable for municipal communications and public services.

The visual style follows a **Corporate Modern** approach with a lean toward **High-Contrast** functionalism. It prioritizes information density and clear action cues through the use of a vibrant primary red against a stark, neutral backdrop. The emotional response is one of efficiency, transparency, and unmistakable institutional identity.

## Colors

The palette is driven by high-visibility contrast to ensure WCAG AA compliance and instant recognition of interactive elements.

- **Primary (#D30505)**: The main action color. Used for primary buttons, highlights, and critical status indicators. It replaces all previous Olive tones.
- **Secondary (#1D2327)**: Used for structural elements, headers, and secondary backgrounds. It replaces the previous Navy foundation with a more modern, near-black neutral.
- **Neutral Stack**: Surfaces use a tiered white/near-white system (#FFFFFF, #FAFAFA, #F0F0F1) to create subtle depth without relying on shadows.
- **Typography**: Headlines and primary text utilize **Deep Onyx (#0A0C11)** for maximum legibility, while secondary labels use **Mid-Gray (#ABADB3)**.

## Typography

The design system maintains **Public Sans** to preserve a clean, institutional, and highly legible experience across all demographics.

The scale is optimized for readability in public-facing applications. The body text is intentionally set to 17px for increased legibility for older users and mobile scanning. Headlines utilize Heavy (800) and Bold (700) weights to provide clear hierarchy against the new high-contrast color palette. Use semibold (600) for labels and metadata to prevent visual "wash-out" on light gray surfaces.

## Layout & Spacing

This design system operates on an **8px linear scale**. All component dimensions, margins, and internal paddings must be multiples of 8px to maintain a rigid, institutional structure.

The layout uses a **fluid grid** model:
- **Desktop**: 12-column grid with 24px gutters and 24px side margins.
- **Tablet**: 8-column grid with 16px gutters and 24px side margins.
- **Mobile**: 4-column grid with 16px gutters and 16px side margins.

A minimum touch target of 44x44px is strictly enforced for all interactive elements to ensure accessibility for all citizens.

## Elevation & Depth

Hierarchy is established through **tonal layering** and **high-contrast outlines** rather than atmospheric shadows. This creates a "flat-plus" aesthetic that feels modern and lightweight.

- **Layering**: Use the neutral palette tiers to stack information. For example, a card might sit at #FFFFFF on a #F0F0F1 background.
- **Outlines**: Instead of deep shadows, use 1px borders in #ABADB3 or #1D2327 (at low opacity) to define boundaries.
- **Functional Elevation**: Shadows are reserved only for transient elements like modals or dropdown menus. These shadows should be tight, with a low-opacity #0A0C11 tint, conveying proximity rather than dramatic height.

## Shapes

The shape language is consistently **Rounded** to balance the aggressive color palette and heavy typography, ensuring the interface feels approachable.

- **Primary standard**: 8px (0.5rem) for buttons, cards, and input fields.
- **Secondary standard**: 6px (0.375rem) for smaller nested elements, tags, or search bars.
- **Pill**: Used exclusively for status badges and indicators to distinguish them from actionable buttons.

## Components

### Buttons
- **Primary**: Solid Red (#D30505) background with Pure White (#FFFFFF) text.
- **Secondary**: Pure White background with a 1px border in Secondary (#1D2327) and matching text.
- **Tertiary/Ghost**: No background; uses Deep Onyx (#0A0C11) text with a persistent underline.
- **States**: Hover states for Primary buttons should involve a slight darkening of the red. Focus states must display a 2px high-contrast outline with an offset.

### Input Fields
- Use an 8px corner radius and a 1px border (#ABADB3). On focus, the border should transition to #1D2327 at 2px thickness. Labels remain 14px for clarity.

### Cards
- Use an 8px radius with a 1px border in #F0F0F1. Content should have a minimum of 24px internal padding to maintain the civic "breathability" of the layout.

### Chips & Badges
- Status badges use the 12px Semibold typography scale. They are always pill-shaped (999px). Success/Warning/Error statuses should use the primary red only for errors, with high-contrast neutrals for other states to avoid color fatigue.

### Lists
- List items must have a minimum height of 48px. Dividers should be 1px solid #F0F0F1.
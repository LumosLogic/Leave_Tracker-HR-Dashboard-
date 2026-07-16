---
name: Executive Precision
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#464555'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#712ae2'
  on-secondary: '#ffffff'
  secondary-container: '#8a4cfc'
  on-secondary-container: '#fffbff'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 60px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  container-max: 1440px
  sidebar-width: 260px
  gutter: 24px
---

## Brand & Style
The design system is engineered for a premium HR Leave & Attendance experience. It prioritizes clarity, professional trust, and executive efficiency. The brand personality is authoritative yet approachable, minimizing cognitive load for employees while providing high-density data visualization for HR administrators.

The visual style is **Minimalist / Modern Corporate**. It leverages heavy whitespace, a disciplined color application, and a refined "software-as-a-craft" aesthetic inspired by high-end productivity tools. The interface remains quiet, allowing user data and status indicators to take precedence.

## Colors
This design system utilizes a sophisticated palette centered on Indigo and Purple to signal innovation and stability. 

- **Primary Indigo (#4F46E5):** Used for primary actions, active navigation states, and brand-critical elements.
- **Secondary Purple (#7C3AED):** Employed for interactive accents and data visualization categories.
- **Functional Palette:** Green, Yellow, and Red are reserved strictly for status communication (Approved, Pending, Rejected/Urgent).
- **Surface Strategy:** The background uses a soft gray (#F9FAFB) to provide a subtle contrast against white (#FFFFFF) component cards, creating a clear "layered" hierarchy without heavy borders.

## Typography
Inter is used across all levels for its exceptional legibility and neutral, systematic feel. 

- **Headlines:** Use tighter letter spacing (-0.02em) to create a modern, high-end editorial feel.
- **Body:** Standardized at 14px for density-rich dashboards, with 16px reserved for reading-heavy settings or modals.
- **Labels:** Uppercase styles are reserved for small utility text (e.g., table headers or overlines) to provide visual rhythm without competing with primary data.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid** model. The sidebar remains fixed at 260px, while the main content area utilizes a fluid grid with a maximum inner container width of 1440px.

- **Grid:** Use a 12-column grid for dashboard layouts. 
- **Rhythm:** An 8px base unit (4px for micro-adjustments) ensures consistent alignment.
- **Padding:** Content cards use 24px (lg) internal padding to maintain the "generous whitespace" requirement.
- **Mobile:** Transition to a 4-column grid with 16px margins; the sidebar collapses into a bottom sheet or a hidden hamburger menu.

## Elevation & Depth
This design system uses **Tonal Layers** and **Ambient Shadows** to create a structured hierarchy.

- **Level 0 (Background):** #F9FAFB - The base canvas.
- **Level 1 (Cards/Sidebar):** #FFFFFF - Pure white surfaces for primary interaction zones.
- **Shadows:** Use a "soft-depth" approach. Low-intensity shadows (Blur: 12px, Y: 4px, Color: #000000 at 4% opacity) are applied to cards to make them float subtly above the gray background.
- **Interactions:** On hover, card elevation increases slightly (Blur: 20px, Y: 8px, Opacity: 6%) to provide tactile feedback.

## Shapes
The shape language is consistently "Soft-Rounded." 

- **Primary Cards:** 16px (rounded-xl) for a modern, friendly feel.
- **Buttons & Inputs:** 8px (rounded-lg) to balance the softness with a sense of professional precision.
- **Badges/Chips:** Fully rounded (pill-shaped) to distinguish them from interactive buttons.

## Components

- **Sidebar Navigation:** Use a semi-transparent active state (Indigo at 10% opacity) with a solid 3px Indigo left-border indicator. Use "Inter" Medium for nav items.
- **Data Tables:** Borderless design. Use a subtle bottom stroke (#F3F4F6) only. Row height should be 56px for readability. Header text should use `label-sm`.
- **Status Badges:** Subtle background tints (e.g., Success Green at 10% opacity) with high-contrast text. No heavy borders.
- **Analytics Cards:** Top-aligned values using `headline-md`. Include sparklines in Primary Indigo or Secondary Purple to show attendance trends.
- **Form Inputs:** 1px stroke (#E5E7EB) that transitions to 2px Indigo (#4F46E5) on focus. Labels sit 8px above the input in `label-md` weight.
- **Action Buttons:** Primary buttons use a solid Indigo fill with white text. Secondary buttons use a white fill with a subtle gray border to maintain the minimalist aesthetic.
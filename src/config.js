// ─────────────────────────────────────────────────────────────
//  PORTFOLIO CONFIG — this is the only file you need to edit.
//
//  Everything personal lives here: the browser tab title, the boot
//  wordmark, your name/tagline, and the content columns. The rest of
//  the codebase (the XMB engine + wave background) reads from this.
//
//  • Each entry in `categories` becomes a column in the XrossMediaBar.
//  • Each item can have a `body` (shown when opened) and an optional
//    `href` (adds an "Open ↗" link / opens on Enter).
// ─────────────────────────────────────────────────────────────

export const config = {
  // Browser tab title (also used for SEO).
  siteTitle: 'John Doe — Portfolio',

  // Boot screen: the wordmark that fades in before the XMB.
  boot: {
    wordmark: 'John Doe',
  },

  // Header identity, top-left of the XMB.
  profile: {
    name: 'John Doe',
    tagline: 'Computer Science · XYZ University, Dubai',
  },

  // Which category the XMB lands on at startup (use a category `id`).
  startCategory: 'projects',

  // The content columns.
  categories: [
    {
      id: 'about',
      label: 'About',
      icon: 'user',
      items: [
        {
          id: 'bio',
          title: 'Who I Am',
          subtitle: 'Profile',
          body: 'Hey — I’m John Doe, a Computer Science student at XYZ University, Dubai. I like building things that feel as good as they look. This portfolio is styled after the PlayStation 3 XrossMediaBar — use the arrow keys to move around.',
        },
        {
          id: 'education',
          title: 'Education',
          subtitle: 'XYZ University, Dubai',
          body: 'B.E. Computer Science — XYZ University, Dubai Campus.\nReplace this with your years, coursework highlights, and GPA if you’d like.',
        },
        {
          id: 'interests',
          title: 'Interests',
          subtitle: 'Off the clock',
          body: 'Game UI/UX, retro consoles, web animation, and systems that feel alive. Add your real hobbies here.',
        },
      ],
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: 'cube',
      items: [
        {
          id: 'p1',
          title: 'Project One',
          subtitle: 'Web · React',
          body: 'Short description of what it does, the stack, and your role. Add a link.',
        },
        {
          id: 'p2',
          title: 'Project Two',
          subtitle: 'Tooling',
          body: 'Short description. What problem it solved and what you learned.',
        },
        {
          id: 'p3',
          title: 'Project Three',
          subtitle: 'Experiment',
          body: 'Short description of a fun side project or hackathon build.',
        },
      ],
    },
    {
      id: 'skills',
      label: 'Skills',
      icon: 'spark',
      items: [
        { id: 's1', title: 'Languages', subtitle: 'Core', body: 'JavaScript, Python, C++, … (edit me).' },
        { id: 's2', title: 'Frameworks', subtitle: 'Stack', body: 'React, Node, … (edit me).' },
        { id: 's3', title: 'Tools', subtitle: 'Workflow', body: 'Git, Figma, Linux, … (edit me).' },
      ],
    },
    {
      id: 'experience',
      label: 'Experience',
      icon: 'briefcase',
      items: [
        { id: 'e1', title: 'Role / Internship', subtitle: 'Company · Year', body: 'What you did and the impact. Edit me.' },
        { id: 'e2', title: 'Activity / Club', subtitle: 'Role · Year', body: 'Leadership, events, or volunteering. Edit me.' },
      ],
    },
    {
      id: 'contact',
      label: 'Contact',
      icon: 'mail',
      items: [
        { id: 'email', title: 'Email', subtitle: 'Reach me', logo: 'gmail', body: 'john.doe@example.com', href: 'mailto:john.doe@example.com' },
        { id: 'github', title: 'GitHub', subtitle: 'Code', logo: 'github', body: 'github.com/johndoe', href: 'https://github.com/johndoe' },
        { id: 'linkedin', title: 'LinkedIn', subtitle: 'Network', logo: 'linkedin', body: 'linkedin.com/in/johndoe', href: 'https://www.linkedin.com/in/johndoe' },
      ],
    },
  ],
}

// Convenience named exports so consumers can pull just what they need.
export const { siteTitle, boot, profile, startCategory, categories } = config

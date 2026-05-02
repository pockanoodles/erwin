export const getTitleFromPathname = (pathname: string) => {
  switch (pathname) {
    case "/calendar":
      return "Calendar | Erwin";
    case "/tasks":
      return "Tasks | Erwin";
    case "/focus":
      return "Focus | Erwin";
    case "/progress":
      return "Progress | Erwin";
    case "/settings":
      return "Settings | Erwin";
    case "/setup":
      return "Setup | Erwin";
    case "/auth/signin":
      return "Sign In | Erwin";
    case "/auth/signup":
      return "Sign Up | Erwin";
    case "/auth/reset-password":
      return "Reset Password | Erwin";
    default:
      return "Erwin";
  }
};

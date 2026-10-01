import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/library/:path*",
    "/generate/:path*",
    "/papers/:path*",
    "/settings/:path*",
  ],
};

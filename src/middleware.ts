export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/library/:path*",
    "/generate/:path*",
    "/papers/:path*",
    "/settings/:path*",
  ],
};

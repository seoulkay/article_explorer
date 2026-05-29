/** @type {import('next').NextConfig} */
module.exports = {
  // snowflake-sdk는 Node.js 전용 패키지이므로 서버 사이드에서만 번들링
  serverExternalPackages: ['snowflake-sdk'],
}

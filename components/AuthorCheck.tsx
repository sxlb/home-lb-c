import pkg from "../package.json";

// 作者版权校验组件（Server Component，不产生客户端代码）
// 在服务端读取 package.json 并检查 author，结果不打包到客户端 bundle
// 仅在开发环境输出警告；生产环境静默通过
export default function AuthorCheck() {
  // next build 时 process.env.NODE_ENV 会被 webpack 替换为字面量值
  if (process.env.NODE_ENV === "development" && pkg.author !== "sxlb") {
    console.warn("[home-lb] 检测到作者信息已被修改，请保留 package.json 中的 author 版权标识");
  }
  return null;
}

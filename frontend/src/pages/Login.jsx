export default function Login() {
  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white shadow-xl rounded-lg border border-gray-100">
      <h2 className="text-2xl font-bold text-center mb-6">Iniciar Sesión</h2>
      <form className="flex flex-col space-y-4">
        <input type="email" placeholder="Correo electrónico" className="p-3 border rounded focus:ring-2 focus:ring-blue-600 outline-none" />
        <input type="password" placeholder="Contraseña" className="p-3 border rounded focus:ring-2 focus:ring-blue-600 outline-none" />
        <button type="button" className="bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">Entrar</button>
      </form>
    </div>
  );
}

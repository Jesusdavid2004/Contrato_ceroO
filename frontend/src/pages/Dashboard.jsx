export default function Dashboard() {
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Tus Contratos Analizados</h2>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:bg-gray-50 transition cursor-pointer mb-8">
          <p className="text-gray-500 font-medium">Arrastra tu contrato en PDF o Imagen aquí (Máx. 10MB)</p>
          <button className="mt-4 bg-gray-800 text-white px-4 py-2 rounded">Seleccionar Archivo</button>
        </div>
        
        <h3 className="text-xl font-semibold mb-4">Historial Reciente</h3>
        <p className="text-gray-500 text-sm">Aún no has analizado ningún contrato.</p>
      </div>
    </div>
  );
}

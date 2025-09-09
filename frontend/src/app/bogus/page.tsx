"use client";
import BogusITCUpload from "@/components/bogus-itc/BogusITCUpload";
import AuthGuard from "@/components/AuthGuard";
import { Shield, AlertTriangle, CheckCircle } from "lucide-react";

export default function BogusPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="container mx-auto px-6 py-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-xl">
                <Shield className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Bogus ITC Detector
                </h1>
                <p className="text-gray-600 mt-1">
                  Verify authenticity of Input Tax Credit claims
                </p>
              </div>
            </div>
          </div>
        </div>

       
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-6xl mx-auto">
           
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">Detection</h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Advanced algorithms to identify potentially fraudulent ITC claims
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">Verification</h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Cross-reference with official databases for authenticity
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
                    <Shield className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">Security</h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Secure processing with enterprise-grade data protection
                </p>
              </div>
            </div>

            
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
                <h2 className="text-xl font-semibold text-white mb-2">
                  Upload ITC Documents
                </h2>
                <p className="text-blue-100">
                  Upload your ITC documents for comprehensive fraud detection analysis
                </p>
              </div>
              
              <div className="p-8">
                <BogusITCUpload />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
